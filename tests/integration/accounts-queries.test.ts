import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { v4 as uuid } from "uuid";
import { createTestDb } from "./setup";
import { provisionHousehold } from "@/lib/auth/provision";
import {
  getAccounts,
  getAccountsByInstitution,
  getAccountSummary,
  getReportFilterAccounts,
} from "@/queries/accounts";
import { accounts, bankConnections } from "@/db/schema";
import { insertTransaction } from "./helpers";
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
    await testDb.insert(bankConnections).values({
      id: itemId,
      householdId,
      provider: "plaid",
      credential: "encrypted-token",
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
    await insertAccount(db, hh, { name: "Deleted", deletedAt: new Date("2026-01-01") });

    const result = await getAccounts(hh, db);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Active");
  });

  describe("getReportFilterAccounts", () => {
    it("returns disconnected accounts alongside live ones, flagged", async () => {
      const hh = await provisionHousehold("user-filter-1", db);
      await insertAccount(db, hh, { name: "Live Checking" });
      await insertAccount(db, hh, { name: "Old Checking", deletedAt: new Date("2026-05-20") });

      const result = await getReportFilterAccounts(hh, db);

      expect(result.map((a) => a.name).sort()).toEqual(["Live Checking", "Old Checking"]);
      expect(result.find((a) => a.name === "Live Checking")!.disconnected).toBe(false);
      expect(result.find((a) => a.name === "Old Checking")!.disconnected).toBe(true);
    });

    it("sorts live accounts ahead of disconnected ones", async () => {
      const hh = await provisionHousehold("user-filter-2", db);
      // "Zeta" sorts last alphabetically but is live, so it must still come
      // before the disconnected "Alpha" -- the popover renders in this order.
      await insertAccount(db, hh, { name: "Alpha", deletedAt: new Date("2026-05-20") });
      await insertAccount(db, hh, { name: "Zeta" });

      const result = await getReportFilterAccounts(hh, db);

      expect(result.map((a) => a.name)).toEqual(["Zeta", "Alpha"]);
    });

    it("reports the transaction date range of a disconnected account", async () => {
      const hh = await provisionHousehold("user-filter-3", db);
      const accountId = await insertAccount(db, hh, {
        name: "Old Checking",
        deletedAt: new Date("2026-05-20"),
      });
      await insertTransaction(db, hh, accountId, { date: "2026-02-11" });
      await insertTransaction(db, hh, accountId, { date: "2026-05-11" });
      await insertTransaction(db, hh, accountId, { date: "2026-03-02" });

      const [account] = await getReportFilterAccounts(hh, db);

      expect(account.txnCount).toBe(3);
      expect(account.firstTxnDate).toBe("2026-02-11");
      expect(account.lastTxnDate).toBe("2026-05-11");
    });

    it("reports a zero count and null range for an account with no transactions", async () => {
      const hh = await provisionHousehold("user-filter-4", db);
      await insertAccount(db, hh, { name: "Empty" });

      const [account] = await getReportFilterAccounts(hh, db);

      expect(account.txnCount).toBe(0);
      expect(account.firstTxnDate).toBeNull();
      expect(account.lastTxnDate).toBeNull();
    });

    it("does not leak accounts or counts across households", async () => {
      const mine = await provisionHousehold("user-filter-5", db);
      const theirs = await provisionHousehold("user-filter-6", db);
      const accountId = await insertAccount(db, mine, { name: "Mine" });
      await insertTransaction(db, mine, accountId, { date: "2026-04-01" });
      const otherId = await insertAccount(db, theirs, { name: "Theirs" });
      await insertTransaction(db, theirs, otherId, { date: "2026-04-02" });

      const result = await getReportFilterAccounts(mine, db);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Mine");
      expect(result[0].txnCount).toBe(1);
    });
  });

  it("getAccountsByInstitution groups Plaid accounts under institution, manual under 'Manual Accounts'", async () => {
    const hh = await provisionHousehold("user-2", db);
    const itemId = await insertPlaidItem(db, hh);

    await insertAccount(db, hh, { name: "Checking", bankConnectionId: itemId, externalAccountId: "pa-1" });
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

  // Liability balances are stored negative (owed = negative), so net worth is
  // the plain sum of every balance. See the currentBalance note in
  // src/db/schema/accounts.ts.
  it("getAccountSummary sums negative liability balances into net worth", async () => {
    const hh = await provisionHousehold("user-3", db);

    await insertAccount(db, hh, { name: "Checking", type: "checking", currentBalance: 500000 });
    await insertAccount(db, hh, { name: "Savings", type: "savings", currentBalance: 1000000 });
    await insertAccount(db, hh, { name: "Credit Card", type: "credit", currentBalance: -50000 });

    const summary = await getAccountSummary(hh, db);
    expect(summary.totalAssets).toBe(1500000);
    expect(summary.totalLiabilities).toBe(-50000);
    expect(summary.netWorth).toBe(1450000);
  });

  it("getAccountSummary subtracts debt rather than adding it", async () => {
    // Regression for the inverted-sign bug: netWorth was assets - liabilities
    // over negative-stored liabilities, which added the debt instead.
    const hh = await provisionHousehold("user-3b", db);

    await insertAccount(db, hh, { name: "Checking", type: "checking", currentBalance: 6170000 });
    await insertAccount(db, hh, { name: "Everyday Card", type: "credit", currentBalance: -180000 });
    await insertAccount(db, hh, { name: "Car Loan", type: "loan", currentBalance: -820000 });

    const summary = await getAccountSummary(hh, db);
    expect(summary.netWorth).toBe(5170000);
    expect(summary.netWorth).toBeLessThan(summary.totalAssets);
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
    await insertAccount(db, hh, { name: "Deleted", currentBalance: 200000, deletedAt: new Date("2026-01-01") });

    const all = await getAccounts(hh, db);
    expect(all).toHaveLength(1);

    const groups = await getAccountsByInstitution(hh, db);
    const totalAccounts = groups.reduce((sum, g) => sum + g.accounts.length, 0);
    expect(totalAccounts).toBe(1);

    const summary = await getAccountSummary(hh, db);
    expect(summary.totalAssets).toBe(100000);
  });
});
