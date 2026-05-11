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
  let close: () => Promise<void>;
  let householdId: string;
  let accountId: string;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    ({ householdId } = await insertHousehold(db));
    ({ accountId } = await insertAccount(db, householdId));

    await insertTransaction(db, householdId, accountId, {
      name: "Grocery",
      date: "2026-05-01",
      amount: 4500,
      normalizedAmount: -4500,
    });
    await insertTransaction(db, householdId, accountId, {
      name: "Gas",
      date: "2026-05-02",
      amount: 2300,
      normalizedAmount: -2300,
    });
    await insertTransaction(db, householdId, accountId, {
      name: "Payroll",
      date: "2026-05-03",
      amount: -320000,
      normalizedAmount: 320000,
      reviewed: true,
    });
    await insertTransaction(db, householdId, accountId, {
      name: "Transfer",
      date: "2026-05-04",
      amount: -10000,
      normalizedAmount: 10000,
      isTransfer: true,
    });
    await insertTransaction(db, householdId, accountId, {
      name: "Pending Purchase",
      date: "2026-05-05",
      amount: 999,
      normalizedAmount: -999,
      pending: true,
    });
  });

  afterAll(async () => {
    await close();
  });

  it("returns correct totals for mixed transactions", async () => {
    const summary = await getTransactionSummary(householdId, {}, db);
    expect(summary.count).toBe(5);
    expect(summary.totalExpense).toBe(6800);
    expect(summary.totalIncome).toBe(320000);
    expect(summary.net).toBe(313200);
  });

  it("respects filters", async () => {
    const summary = await getTransactionSummary(
      householdId,
      { dateFrom: "2026-05-01", dateTo: "2026-05-02" },
      db,
    );
    expect(summary.count).toBe(2);
    expect(summary.totalExpense).toBe(6800);
    expect(summary.totalIncome).toBe(0);
    expect(summary.net).toBe(-6800);
  });

  it("excludes pending transactions from totals", async () => {
    const summary = await getTransactionSummary(householdId, {}, db);
    expect(summary.totalExpense).toBe(6800);
  });
});
