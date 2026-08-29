import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { createTestDb } from "./setup";
import { insertHousehold, insertAccount, insertTransaction } from "./helpers";
import { applyRecurringDetection } from "@/lib/simplefin/recurring";
import { recurringTransactions, transactions } from "@/db/schema";

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

  it("retires a stream that is no longer detected", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db);
      const { accountId } = await insertAccount(db, householdId, { type: "credit" });

      // A previously-detected stream that today's transactions no longer support.
      const staleId = uuid();
      await db.insert(recurringTransactions).values({
        id: staleId,
        householdId,
        accountId,
        plaidStreamId: null,
        name: "Cancelled Subscription",
        frequency: "monthly",
        isActive: true,
      });

      await applyRecurringDetection(householdId, db);

      const [stale] = await db
        .select()
        .from(recurringTransactions)
        .where(eq(recurringTransactions.id, staleId));
      expect(stale.isActive).toBe(false);
    } finally {
      await close();
    }
  });

  it("leaves Plaid-sourced streams alone when sweeping", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db);
      const { accountId } = await insertAccount(db, householdId, { type: "credit" });

      const plaidId = uuid();
      await db.insert(recurringTransactions).values({
        id: plaidId,
        householdId,
        accountId,
        plaidStreamId: "stream-owned-by-plaid",
        name: "Plaid Stream",
        frequency: "monthly",
        isActive: true,
      });

      await applyRecurringDetection(householdId, db);

      const [row] = await db
        .select()
        .from(recurringTransactions)
        .where(eq(recurringTransactions.id, plaidId));
      expect(row.isActive).toBe(true);
    } finally {
      await close();
    }
  });

  it("retires an orphaned row instead of duplicating alongside it", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db);
      const { accountId } = await insertAccount(db, householdId, { type: "credit" });

      // What onDelete: "set null" leaves behind once an account is removed.
      await db.insert(recurringTransactions).values({
        id: uuid(),
        householdId,
        accountId: null,
        plaidStreamId: null,
        name: "Netflix",
        frequency: "monthly",
        isActive: true,
      });

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

      const rows = await db
        .select()
        .from(recurringTransactions)
        .where(eq(recurringTransactions.householdId, householdId));

      // The freshly detected stream is active; the orphan is not left active
      // beside it.
      expect(rows.filter((r) => r.isActive).length).toBe(1);
      expect(rows.find((r) => r.isActive)!.accountId).toBe(accountId);
    } finally {
      await close();
    }
  });

  it("back-links the transactions that make up a detected stream", async () => {
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

      const [recurring] = await db
        .select()
        .from(recurringTransactions)
        .where(eq(recurringTransactions.householdId, householdId));

      const txns = await db
        .select()
        .from(transactions)
        .where(eq(transactions.householdId, householdId));

      expect(txns).toHaveLength(3);
      expect(txns.every((t) => t.recurringTransactionId === recurring.id)).toBe(true);
    } finally {
      await close();
    }
  });
});
