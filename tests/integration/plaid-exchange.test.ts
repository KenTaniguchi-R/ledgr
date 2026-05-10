import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import { createTestDb } from "./setup";
import { server } from "../mocks/server";
import { provisionHousehold } from "@/lib/auth/provision";
import { encryptAccessToken, decryptAccessToken } from "@/lib/plaid/token";
import { plaidItems, accounts, balanceHistory } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { mapPlaidAccountType, exchangeAndStoreAccounts } from "@/actions/plaid";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

describe("plaid exchange flow", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let close: () => void;

  afterEach(() => {
    server.resetHandlers();
    close?.();
  });

  function setup() {
    const result = createTestDb();
    db = result.db;
    close = result.close;
    return db;
  }

  it("stores plaid item with encrypted token and creates accounts with correct balances", async () => {
    const testDb = setup();
    const hh = provisionHousehold("user-1", testDb);

    const result = await exchangeAndStoreAccounts("public-sandbox-token", hh, testDb);
    expect(result.success).toBe(true);
    expect(result.accountCount).toBe(4);

    const items = testDb.select().from(plaidItems).where(eq(plaidItems.householdId, hh)).all();
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("active");
    expect(items[0].institutionName).toBe("Chase");
    expect(items[0].plaidInstitutionId).toBe("ins_1");

    const decrypted = decryptAccessToken(items[0].accessToken);
    expect(decrypted).toBe("access-sandbox-test-token-abc123");

    const accts = testDb.select().from(accounts).where(eq(accounts.householdId, hh)).all();
    expect(accts).toHaveLength(4);

    const checking = accts.find((a) => a.plaidAccountId === "plaid-acc-checking")!;
    expect(checking.currentBalance).toBe(100000);
    expect(checking.availableBalance).toBe(90000);
    expect(checking.type).toBe("checking");

    const credit = accts.find((a) => a.plaidAccountId === "plaid-acc-credit")!;
    expect(credit.currentBalance).toBe(45050);
    expect(credit.creditLimit).toBe(100000);
    expect(credit.type).toBe("credit");
  });

  it("stores null balances as null, not zero", async () => {
    const testDb = setup();
    const hh = provisionHousehold("user-null", testDb);

    await exchangeAndStoreAccounts("public-sandbox-token", hh, testDb);

    const accts = testDb.select().from(accounts).where(eq(accounts.householdId, hh)).all();
    const investment = accts.find((a) => a.plaidAccountId === "plaid-acc-null")!;
    expect(investment.currentBalance).toBeNull();
    expect(investment.availableBalance).toBeNull();
    expect(investment.type).toBe("investment");
  });

  it("creates balance_history for accounts with non-null balances only", async () => {
    const testDb = setup();
    const hh = provisionHousehold("user-history", testDb);

    await exchangeAndStoreAccounts("public-sandbox-token", hh, testDb);

    const history = testDb.select().from(balanceHistory).all();
    expect(history.length).toBe(3);
  });

  it("isolates accounts between households", async () => {
    const testDb = setup();
    const hhA = provisionHousehold("user-a", testDb);
    const hhB = provisionHousehold("user-b", testDb);

    await exchangeAndStoreAccounts("public-sandbox-token", hhA, testDb);

    const scopeB = scopedQuery(hhB, testDb);
    const accts = testDb.select().from(accounts).where(scopeB.where(accounts)).all();
    expect(accts).toHaveLength(0);
  });

  it("rejects duplicate institution for same household", async () => {
    const testDb = setup();
    const hh = provisionHousehold("user-dup", testDb);

    await exchangeAndStoreAccounts("public-sandbox-token", hh, testDb);
    const result = await exchangeAndStoreAccounts("public-sandbox-token", hh, testDb);

    expect(result.success).toBe(false);
    expect(result.error).toContain("already connected");
  });

  it("maps account types correctly", () => {
    expect(mapPlaidAccountType("depository", "checking")).toBe("checking");
    expect(mapPlaidAccountType("depository", "savings")).toBe("savings");
    expect(mapPlaidAccountType("depository", "money market")).toBe("checking");
    expect(mapPlaidAccountType("credit", "credit card")).toBe("credit");
    expect(mapPlaidAccountType("loan", "mortgage")).toBe("loan");
    expect(mapPlaidAccountType("investment", "401k")).toBe("investment");
    expect(mapPlaidAccountType("other", null)).toBe("other");
  });
});
