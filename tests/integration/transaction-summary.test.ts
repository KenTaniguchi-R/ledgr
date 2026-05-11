import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertTransaction,
} from "./helpers";
import { getTransactionSummary } from "../../src/queries/transactions";
import type { LedgrDb } from "../../src/db";

describe("getTransactionSummary", () => {
  let db: LedgrDb;
  let close: () => void;
  let householdId: string;
  let accountId: string;

  beforeAll(() => {
    const testDb = createTestDb();
    db = testDb.db;
    close = testDb.close;
    ({ householdId } = insertHousehold(db));
    ({ accountId } = insertAccount(db, householdId));

    // Expense: normalizedAmount = -4500 (negative = expense)
    insertTransaction(db, householdId, accountId, {
      name: "Grocery",
      date: "2026-05-01",
      amount: 4500,
      normalizedAmount: -4500,
    });
    // Expense: normalizedAmount = -2300
    insertTransaction(db, householdId, accountId, {
      name: "Gas",
      date: "2026-05-02",
      amount: 2300,
      normalizedAmount: -2300,
    });
    // Income/credit: normalizedAmount = 320000
    insertTransaction(db, householdId, accountId, {
      name: "Payroll",
      date: "2026-05-03",
      amount: -320000,
      normalizedAmount: 320000,
      reviewed: true,
    });
    // Transfer (excluded from expense/credits but counted)
    insertTransaction(db, householdId, accountId, {
      name: "Transfer",
      date: "2026-05-04",
      amount: -10000,
      normalizedAmount: 10000,
      isTransfer: true,
    });
    // Pending (excluded from totals)
    insertTransaction(db, householdId, accountId, {
      name: "Pending Purchase",
      date: "2026-05-05",
      amount: 999,
      normalizedAmount: -999,
      pending: true,
    });
  });

  afterAll(() => close());

  it("returns correct totals for mixed transactions", () => {
    const summary = getTransactionSummary(householdId, {}, db);
    expect(summary.count).toBe(5);
    // Expenses: 4500 + 2300 = 6800 (pending excluded from totals)
    expect(summary.totalExpense).toBe(6800);
    // Credits: 320000 (transfer excluded from expense/credits)
    expect(summary.totalIncome).toBe(320000);
    // Net: credits - expenses = 320000 - 6800 = 313200
    expect(summary.net).toBe(313200);
  });

  it("respects filters", () => {
    const summary = getTransactionSummary(
      householdId,
      { dateFrom: "2026-05-01", dateTo: "2026-05-02" },
      db,
    );
    expect(summary.count).toBe(2);
    expect(summary.totalExpense).toBe(6800);
    expect(summary.totalIncome).toBe(0);
    expect(summary.net).toBe(-6800);
  });

  it("excludes pending transactions from totals", () => {
    const summary = getTransactionSummary(householdId, {}, db);
    // Pending -999 should NOT be in totalExpense
    expect(summary.totalExpense).toBe(6800);
  });
});
