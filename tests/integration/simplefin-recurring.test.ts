import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./setup";
import { insertHousehold, insertAccount, insertTransaction } from "./helpers";
import { applyRecurringDetection } from "@/lib/simplefin/recurring";
import { recurringTransactions } from "@/db/schema";

// Derived relative to "now" so the monthly pattern's predicted next
// occurrence stays inside the isActive window regardless of when the suite runs
// (repo convention: never hardcode absolute dates in a "recent" window).
function monthsAgoDate(n: number, dayOfMonth = 1): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  d.setUTCDate(dayOfMonth);
  return d.toISOString().slice(0, 10);
}

describe("applyRecurringDetection", () => {
  it("upserts a monthly SimpleFIN pattern into recurring_transactions", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db);
      const { accountId } = await insertAccount(db, householdId, { type: "credit" });

      for (const date of [monthsAgoDate(2), monthsAgoDate(1), monthsAgoDate(0)]) {
        await insertTransaction(db, householdId, accountId, {
          date,
          name: "Netflix",
          normalizedAmount: -1599,
          amount: 1599,
          provider: "simplefin",
        });
      }

      const count = await applyRecurringDetection(householdId, db);
      expect(count).toBe(1);

      const rows = await db
        .select()
        .from(recurringTransactions)
        .where(eq(recurringTransactions.householdId, householdId));

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        accountId,
        name: "Netflix",
        frequency: "monthly",
        averageAmount: 1599,
        lastAmount: -1599,
        lastDate: monthsAgoDate(0),
        isActive: true,
        isIncome: false,
        plaidStreamId: null,
      });
    } finally {
      await close();
    }
  });

  it("is idempotent — a second call updates the same row instead of duplicating", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db);
      const { accountId } = await insertAccount(db, householdId, { type: "credit" });

      for (const date of [monthsAgoDate(2), monthsAgoDate(1), monthsAgoDate(0)]) {
        await insertTransaction(db, householdId, accountId, {
          date,
          name: "Netflix",
          normalizedAmount: -1599,
          amount: 1599,
          provider: "simplefin",
        });
      }

      await applyRecurringDetection(householdId, db);
      await applyRecurringDetection(householdId, db);

      const rows = await db
        .select()
        .from(recurringTransactions)
        .where(eq(recurringTransactions.householdId, householdId));

      expect(rows).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("only tags transactions belonging to the given household", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db);
      const { householdId: otherHouseholdId } = await insertHousehold(db, "Other Household");
      const { accountId: otherAccountId } = await insertAccount(db, otherHouseholdId, { type: "credit" });

      for (const date of [monthsAgoDate(2), monthsAgoDate(1), monthsAgoDate(0)]) {
        await insertTransaction(db, otherHouseholdId, otherAccountId, {
          date,
          name: "Netflix",
          normalizedAmount: -1599,
          amount: 1599,
          provider: "simplefin",
        });
      }

      const count = await applyRecurringDetection(householdId, db);
      expect(count).toBe(0);

      const rows = await db
        .select()
        .from(recurringTransactions)
        .where(eq(recurringTransactions.householdId, otherHouseholdId));
      expect(rows).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it("ignores transactions from other providers", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db);
      const { accountId } = await insertAccount(db, householdId, { type: "credit" });

      for (const date of [monthsAgoDate(2), monthsAgoDate(1), monthsAgoDate(0)]) {
        await insertTransaction(db, householdId, accountId, {
          date,
          name: "Netflix",
          normalizedAmount: -1599,
          amount: 1599,
          provider: "plaid",
        });
      }

      const count = await applyRecurringDetection(householdId, db);
      expect(count).toBe(0);

      const rows = await db
        .select()
        .from(recurringTransactions)
        .where(eq(recurringTransactions.householdId, householdId));
      expect(rows).toHaveLength(0);
    } finally {
      await close();
    }
  });
});
