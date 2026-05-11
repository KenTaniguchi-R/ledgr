import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertTransaction,
  insertCategoryGroup,
  insertCategory,
} from "./helpers";
import { getTransactions } from "../../src/queries/transactions";
import type { LedgrDb } from "../../src/db";

describe("getTransactions", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;
  let householdId: string;
  let accountId: string;
  let categoryId: string;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());

    ({ householdId } = await insertHousehold(db));
    ({ accountId } = await insertAccount(db, householdId, { name: "Chase Checking" }));
    const { groupId } = await insertCategoryGroup(db, householdId, { name: "Food" });
    ({ categoryId } = await insertCategory(db, householdId, groupId, { name: "Groceries" }));

    await insertTransaction(db, householdId, accountId, { name: "Whole Foods", date: "2026-05-01", amount: -4500, normalizedAmount: 4500 });
    await insertTransaction(db, householdId, accountId, { name: "Target", date: "2026-05-02", amount: -2300, normalizedAmount: 2300, categoryId });
    await insertTransaction(db, householdId, accountId, { name: "Payroll", date: "2026-05-03", amount: 320000, normalizedAmount: -320000, reviewed: true });
    await insertTransaction(db, householdId, accountId, { name: "Amazon", date: "2026-05-04", amount: -1500, normalizedAmount: 1500 });
    await insertTransaction(db, householdId, accountId, { name: "Spotify", date: "2026-05-05", amount: -999, normalizedAmount: 999, pending: true });
  });

  afterAll(async () => {
    await close();
  });

  it("returns non-deleted transactions for the household", async () => {
    const page = await getTransactions(householdId, {}, 50, null, db);
    expect(page.rows).toHaveLength(5);
    expect(page.rows[0].date).toBe("2026-05-05");
  });

  it("filters by date range", async () => {
    const page = await getTransactions(householdId, { dateFrom: "2026-05-02", dateTo: "2026-05-04" }, 50, null, db);
    expect(page.rows).toHaveLength(3);
  });

  it("filters by categoryId", async () => {
    const page = await getTransactions(householdId, { categoryId }, 50, null, db);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0].name).toBe("Target");
  });

  it("filters by categoryId null (uncategorized)", async () => {
    const page = await getTransactions(householdId, { categoryId: null }, 50, null, db);
    expect(page.rows).toHaveLength(4);
  });

  it("filters by reviewed status", async () => {
    const page = await getTransactions(householdId, { reviewed: true }, 50, null, db);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0].name).toBe("Payroll");
  });

  it("filters by search substring (case-insensitive)", async () => {
    const page = await getTransactions(householdId, { search: "whole" }, 50, null, db);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0].name).toBe("Whole Foods");
  });

  it("paginates with cursor — no overlap", async () => {
    const page1 = await getTransactions(householdId, {}, 2, null, db);
    expect(page1.rows).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await getTransactions(householdId, {}, 2, page1.nextCursor, db);
    expect(page2.rows).toHaveLength(2);

    const page1Ids = new Set(page1.rows.map((r) => r.id));
    for (const row of page2.rows) {
      expect(page1Ids.has(row.id)).toBe(false);
    }
  });

  it("handles malformed cursor by returning first page", async () => {
    const page = await getTransactions(householdId, {}, 50, "not-valid-base64!!", db);
    expect(page.rows).toHaveLength(5);
  });

  it("enforces household isolation", async () => {
    const { householdId: otherId } = await insertHousehold(db, "Other Household");
    const { accountId: otherAcct } = await insertAccount(db, otherId);
    await insertTransaction(db, otherId, otherAcct, { name: "Other's Transaction" });

    const page = await getTransactions(householdId, {}, 50, null, db);
    expect(page.rows.every((r) => r.name !== "Other's Transaction")).toBe(true);
  });

  it("joins category name and account name", async () => {
    const page = await getTransactions(householdId, { categoryId }, 50, null, db);
    expect(page.rows[0].categoryName).toBe("Groceries");
    expect(page.rows[0].categoryGroupName).toBe("Food");
    expect(page.rows[0].accountName).toBe("Chase Checking");
  });

  it("filters by transaction type — expense (negative normalizedAmount, not transfer)", async () => {
    await insertTransaction(db, householdId, accountId, {
      name: "Transfer Out",
      date: "2026-05-06",
      amount: -5000,
      normalizedAmount: 5000,
      isTransfer: true,
    });

    const page = await getTransactions(
      householdId,
      { transactionType: "expense" },
      50, null, db,
    );
    for (const row of page.rows) {
      expect(row.normalizedAmount).toBeLessThan(0);
      expect(row.isTransfer).toBe(false);
    }
  });

  it("filters by transaction type — credits (positive normalizedAmount, not transfer)", async () => {
    const page = await getTransactions(
      householdId,
      { transactionType: "credits" },
      50, null, db,
    );
    for (const row of page.rows) {
      expect(row.normalizedAmount).toBeGreaterThan(0);
      expect(row.isTransfer).toBe(false);
    }
  });

  it("filters by transaction type — transfer", async () => {
    const page = await getTransactions(
      householdId,
      { transactionType: "transfer" },
      50, null, db,
    );
    for (const row of page.rows) {
      expect(row.isTransfer).toBe(true);
    }
  });

  it("filters by amount range (absolute value)", async () => {
    const page = await getTransactions(
      householdId,
      { amountMin: 1000, amountMax: 3000 },
      50, null, db,
    );
    for (const row of page.rows) {
      expect(Math.abs(row.normalizedAmount)).toBeGreaterThanOrEqual(1000);
      expect(Math.abs(row.normalizedAmount)).toBeLessThanOrEqual(3000);
    }
  });
});
