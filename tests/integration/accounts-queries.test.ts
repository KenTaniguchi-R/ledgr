import { describe, it, expect, afterEach } from "vitest";
import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import { createTestDb } from "./setup";
import { provisionHousehold } from "@/lib/auth/provision";
import {
  getAccounts,
  getAccountsByInstitution,
  getAccountSummary,
} from "@/queries/accounts";
import { accounts, plaidItems } from "@/db/schema";

describe("account queries", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let close: () => void;

  afterEach(() => close?.());

  function setup() {
    const result = createTestDb();
    db = result.db;
    close = result.close;
    return db;
  }

  function insertPlaidItem(testDb: typeof db, householdId: string) {
    const itemId = uuid();
    testDb.insert(plaidItems).values({
      id: itemId,
      householdId,
      accessToken: "encrypted-token",
      plaidInstitutionId: "ins_1",
      institutionName: "Chase",
      status: "active",
    }).run();
    return itemId;
  }

  function insertAccount(
    testDb: typeof db,
    householdId: string,
    overrides: Partial<typeof accounts.$inferInsert> = {}
  ) {
    const id = uuid();
    testDb.insert(accounts).values({
      id,
      householdId,
      name: "Test Account",
      type: "checking",
      currentBalance: 100000,
      ...overrides,
    }).run();
    return id;
  }

  it("getAccounts returns only non-deleted accounts for given household", () => {
    const testDb = setup();
    const hh = provisionHousehold("user-1", testDb);

    insertAccount(testDb, hh, { name: "Active" });
    insertAccount(testDb, hh, { name: "Deleted", deletedAt: "2026-01-01" });

    const result = getAccounts(hh, testDb);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Active");
  });

  it("getAccountsByInstitution groups Plaid accounts under institution, manual under 'Manual Accounts'", () => {
    const testDb = setup();
    const hh = provisionHousehold("user-2", testDb);
    const itemId = insertPlaidItem(testDb, hh);

    insertAccount(testDb, hh, { name: "Checking", plaidItemId: itemId, plaidAccountId: "pa-1" });
    insertAccount(testDb, hh, { name: "Cash", isManual: true });

    const groups = getAccountsByInstitution(hh, testDb);

    const plaidGroup = groups.find((g) => g.institutionName === "Chase");
    expect(plaidGroup).toBeDefined();
    expect(plaidGroup!.accounts).toHaveLength(1);
    expect(plaidGroup!.status).toBe("active");

    const manualGroup = groups.find((g) => g.institutionName === "Manual Accounts");
    expect(manualGroup).toBeDefined();
    expect(manualGroup!.accounts).toHaveLength(1);
  });

  it("getAccountSummary computes assets - liabilities = net worth", () => {
    const testDb = setup();
    const hh = provisionHousehold("user-3", testDb);

    insertAccount(testDb, hh, { name: "Checking", type: "checking", currentBalance: 500000 });
    insertAccount(testDb, hh, { name: "Savings", type: "savings", currentBalance: 1000000 });
    insertAccount(testDb, hh, { name: "Credit Card", type: "credit", currentBalance: 50000 });

    const summary = getAccountSummary(hh, testDb);
    expect(summary.totalAssets).toBe(1500000);
    expect(summary.totalLiabilities).toBe(50000);
    expect(summary.netWorth).toBe(1450000);
  });

  it("getAccountSummary excludes null balances from sums", () => {
    const testDb = setup();
    const hh = provisionHousehold("user-4", testDb);

    insertAccount(testDb, hh, { name: "Known", type: "checking", currentBalance: 500000 });
    insertAccount(testDb, hh, { name: "Unknown", type: "investment", currentBalance: null });

    const summary = getAccountSummary(hh, testDb);
    expect(summary.totalAssets).toBe(500000);
  });

  it("soft-deleted accounts excluded from all queries", () => {
    const testDb = setup();
    const hh = provisionHousehold("user-5", testDb);

    insertAccount(testDb, hh, { name: "Active", currentBalance: 100000 });
    insertAccount(testDb, hh, { name: "Deleted", currentBalance: 200000, deletedAt: "2026-01-01" });

    const all = getAccounts(hh, testDb);
    expect(all).toHaveLength(1);

    const groups = getAccountsByInstitution(hh, testDb);
    const totalAccounts = groups.reduce((sum, g) => sum + g.accounts.length, 0);
    expect(totalAccounts).toBe(1);

    const summary = getAccountSummary(hh, testDb);
    expect(summary.totalAssets).toBe(100000);
  });
});
