import { describe, beforeAll, afterAll } from "vitest";
import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { createTestDb } from "./setup";
import { insertHousehold, insertAccount, insertTransaction } from "./helpers";
import { getTransactions } from "../../src/queries/transactions";
import type { LedgrDb } from "../../src/db";

describe("amount filter property", () => {
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

    for (let i = 0; i < 20; i++) {
      const amt = (i + 1) * 500;
      insertTransaction(db, householdId, accountId, {
        name: `Txn-${i}`,
        date: `2026-05-${String(i + 1).padStart(2, "0")}`,
        amount: amt,
        normalizedAmount: -amt,
      });
    }
  });

  afterAll(() => close());

  test.prop([
    fc.integer({ min: 0, max: 10000 }),
    fc.integer({ min: 0, max: 10000 }),
  ])("amount range never returns out-of-range results", (a, b) => {
    const amountMin = Math.min(a, b);
    const amountMax = Math.max(a, b);

    const page = getTransactions(householdId, { amountMin, amountMax }, 50, null, db);

    for (const row of page.rows) {
      const absAmount = Math.abs(row.normalizedAmount);
      if (absAmount < amountMin || absAmount > amountMax) {
        throw new Error(
          `abs(${row.normalizedAmount}) = ${absAmount} outside [${amountMin}, ${amountMax}]`,
        );
      }
    }
  });
});
