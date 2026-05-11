import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { v4 as uuid } from "uuid";
import { createTestDb } from "./setup";
import { provisionHousehold } from "@/lib/auth/provision";
import {
  getAccounts,
  getAccountsByInstitution,
  getAccountSummary,
} from "@/queries/accounts";
import { accounts, plaidItems } from "@/db/schema";
import type { LedgrDb } from "@/db";

describe("account queries", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  async function insertPlaidItem(testDb: LedgrDb, householdId: string) {
    const itemId = uuid();
    await testDb.insert(plaidItems).values({
      id: itemId,
      householdId,
      accessToken: "encrypted-token",
      plaidInstitutionId: "ins_1",
      institutionName: "Chase",
      status: "active",
    });
    return itemId;
  }

  async function insertAccount(
    testDb: LedgrDb,
    householdId: string,
    overrides: Partial<typeof accounts.$inferInsert> = {}
  ) {
    const id = uuid();
    await testDb.insert(accounts).values({
      id,
      householdId,
      name: "Test Account",
      type: "checking",
      currentBalance: 100000,
      ...overrides,
    });
    return id;
  }

  it("getAccounts returns only non-deleted accounts for given household", async () => {
    const hh = await provisionHousehold("user-1", db);

    await insertAccount(db, hh, { name: "Active" });
    await insertAccount(db, hh, { name: "Deleted", deletedAt: "2026-01-01" });

    const result = await getAccounts(hh, db);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Active");
  });

  it("getAccountsByInstitution groups Plaid accounts under institution, manual under 'Manual Accounts'", async () => {
    const hh = await provisionHousehold("user-2", db);
    const itemId = await insertPlaidItem(db, hh);

    await insertAccount(db, hh, { name: "Checking", plaidItemId: itemId, plaidAccountId: "pa-1" });
    await insertAccount(db, hh, { name: "Cash", isManual: true });

    const groups = await getAccountsByInstitution(hh, db);

    const plaidGroup = groups.find((g) => g.institutionName === "Chase");
    expect(plaidGroup).toBeDefined();
    expect(plaidGroup!.accounts).toHaveLength(1);
    expect(plaidGroup!.status).toBe("active");

    const manualGroup = groups.find((g) => g.institutionName === "Manual Accounts");
    expect(manualGroup).toBeDefined();
    expect(manualGroup!.accounts).toHaveLength(1);
  });

  it("getAccountSummary computes assets - liabilities = net worth", async () => {
    const hh = await provisionHousehold("user-3", db);

    await insertAccount(db, hh, { name: "Checking", type: "checking", currentBalance: 500000 });
    await insertAccount(db, hh, { name: "Savings", type: "savings", currentBalance: 1000000 });
    await insertAccount(db, hh, { name: "Credit Card", type: "credit", currentBalance: 50000 });

    const summary = await getAccountSummary(hh, db);
    expect(summary.totalAssets).toBe(1500000);
    expect(summary.totalLiabilities).toBe(50000);
    expect(summary.netWorth).toBe(1450000);
  });

  it("getAccountSummary excludes null balances from sums", async () => {
    const hh = await provisionHousehold("user-4", db);

    await insertAccount(db, hh, { name: "Known", type: "checking", currentBalance: 500000 });
    await insertAccount(db, hh, { name: "Unknown", type: "investment", currentBalance: null });

    const summary = await getAccountSummary(hh, db);
    expect(summary.totalAssets).toBe(500000);
  });

  it("soft-deleted accounts excluded from all queries", async () => {
    const hh = await provisionHousehold("user-5", db);

    await insertAccount(db, hh, { name: "Active", currentBalance: 100000 });
    await insertAccount(db, hh, { name: "Deleted", currentBalance: 200000, deletedAt: "2026-01-01" });

    const all = await getAccounts(hh, db);
    expect(all).toHaveLength(1);

    const groups = await getAccountsByInstitution(hh, db);
    const totalAccounts = groups.reduce((sum, g) => sum + g.accounts.length, 0);
    expect(totalAccounts).toBe(1);

    const summary = await getAccountSummary(hh, db);
    expect(summary.totalAssets).toBe(100000);
  });
});
