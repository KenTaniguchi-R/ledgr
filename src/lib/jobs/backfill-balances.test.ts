import { describe, it, expect } from "vitest";
import { test } from "@fast-check/vitest";
import * as fc from "fast-check";
import { createTestDb } from "../../../tests/integration/setup";
import { insertHousehold, insertAccount, insertTransaction } from "../../../tests/integration/helpers";
import { backfillAccountBalances } from "./backfill-balances";
import { balanceHistory } from "@/db/schema";
import { v4 as uuid } from "uuid";

describe("backfillAccountBalances", () => {
  it("reconstructs daily balances from transactions", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db);
      // Current balance: 10000 cents ($100)
      const { accountId } = await insertAccount(db, householdId, {
        currentBalance: 10000,
        type: "checking",
      });

      // Transaction on 2026-05-08: spent 3000 (normalizedAmount = -3000, negative = expense)
      await insertTransaction(db, householdId, accountId, {
        date: "2026-05-08",
        normalizedAmount: -3000,
        pending: false,
      });

      // Transaction on 2026-05-07: spent 2000
      await insertTransaction(db, householdId, accountId, {
        date: "2026-05-07",
        normalizedAmount: -2000,
        pending: false,
      });

      await backfillAccountBalances(db);

      const rows = (await db
        .select()
        .from(balanceHistory))
        .sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));

      // Today (2026-05-10): 10000
      // Checking: undoSign = -1. runningBalance + (-1 * dayNet)
      // 2026-05-08: 10000 + (-1 * -3000) = 13000
      // 2026-05-07: 13000 + (-1 * -2000) = 15000
      expect(rows.length).toBeGreaterThanOrEqual(2);

      const byDate = Object.fromEntries(rows.map((r: { date: string; balance: number }) => [r.date, r.balance]));
      // Walking back from today (checking: undo expense by adding absolute value):
      expect(byDate["2026-05-08"]).toBe(13000);
      expect(byDate["2026-05-07"]).toBe(15000);

      // All rows should be for this account
      for (const row of rows) {
        expect(row.accountId).toBe(accountId);
      }
    } finally {
      await close();
    }
  });

  it("skips investment accounts", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db);
      const { accountId } = await insertAccount(db, householdId, {
        currentBalance: 50000,
        type: "investment",
      });

      await insertTransaction(db, householdId, accountId, {
        date: "2026-05-07",
        normalizedAmount: -1000,
        pending: false,
      });

      await backfillAccountBalances(db);

      const rows = await db.select().from(balanceHistory);
      expect(rows).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it("skips dates that already have balance_history entries", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db);
      const { accountId } = await insertAccount(db, householdId, {
        currentBalance: 10000,
        type: "checking",
      });

      await insertTransaction(db, householdId, accountId, {
        date: "2026-05-08",
        normalizedAmount: -1000,
        pending: false,
      });

      // Pre-insert a balance_history row for 2026-05-08 with a specific value
      const existingBalance = 99999;
      await db.insert(balanceHistory)
        .values({
          id: uuid(),
          accountId,
          date: "2026-05-08",
          balance: existingBalance,
        });

      await backfillAccountBalances(db);

      const rows = await db.select().from(balanceHistory);
      const may8Row = rows.find((r) => r.date === "2026-05-08");
      expect(may8Row).toBeDefined();
      // The pre-existing value should NOT be overwritten
      expect(may8Row!.balance).toBe(existingBalance);
    } finally {
      await close();
    }
  });

  test.prop([
    fc.array(fc.integer({ min: -100000, max: 100000 }), { minLength: 1, maxLength: 20 }),
    fc.integer({ min: -1000000, max: 1000000 }),
    fc.constantFrom(-1, 1),
  ])(
    "walking back then forward preserves the original balance",
    (amounts: number[], currentBalance: number, undoSign: number) => {
      // Simulate the backfill algorithm: walk backward from currentBalance
      // undoSign = -1 for depository (checking/savings), 1 for liability (credit/loan)
      // negative normalizedAmount = expense, positive = income

      let balance = currentBalance;
      const historicalBalances: number[] = [balance];

      for (const amount of amounts) {
        balance = balance + undoSign * amount;
        historicalBalances.push(balance);
      }

      // Walk forward: reverse the undo
      let reconstructed = historicalBalances[historicalBalances.length - 1];
      for (let i = amounts.length - 1; i >= 0; i--) {
        reconstructed = reconstructed - undoSign * amounts[i];
      }

      expect(reconstructed).toBe(currentBalance);
    }
  );
});
