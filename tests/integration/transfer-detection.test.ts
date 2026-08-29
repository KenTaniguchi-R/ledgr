import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./setup";
import { insertHousehold, insertAccount, insertTransaction } from "./helpers";
import { applyTransferDetection } from "@/lib/transfer-detection";
import { transactions } from "@/db/schema";

describe("applyTransferDetection", () => {
  it("tags a matching outflow/inflow pair across two accounts", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db);
      const { accountId: checkingId } = await insertAccount(db, householdId, { type: "checking" });
      const { accountId: savingsId } = await insertAccount(db, householdId, { type: "savings" });

      const { transactionId: outflowId } = await insertTransaction(db, householdId, checkingId, {
        date: "2026-05-10",
        normalizedAmount: -50000,
        amount: 50000,
      });
      const { transactionId: inflowId } = await insertTransaction(db, householdId, savingsId, {
        date: "2026-05-10",
        normalizedAmount: 50000,
        amount: -50000,
      });

      const tagged = await applyTransferDetection(householdId, db);
      expect(tagged).toBe(1);

      const rows = await db.select().from(transactions).where(eq(transactions.householdId, householdId));
      const outflow = rows.find((r) => r.id === outflowId)!;
      const inflow = rows.find((r) => r.id === inflowId)!;

      expect(outflow.isTransfer).toBe(true);
      expect(outflow.transferPairId).toBe(inflowId);
      expect(inflow.isTransfer).toBe(true);
      expect(inflow.transferPairId).toBe(outflowId);
    } finally {
      await close();
    }
  });

  it("never re-tags a pair the user explicitly rejected", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db);
      const { accountId: checkingId } = await insertAccount(db, householdId, { type: "checking" });
      const { accountId: savingsId } = await insertAccount(db, householdId, { type: "savings" });

      // A pair the detector would happily match, but which the user has
      // already un-marked ("this is not a transfer").
      const { transactionId: outflowId } = await insertTransaction(db, householdId, checkingId, {
        date: "2026-05-10",
        normalizedAmount: -50000,
        amount: 50000,
        transferSource: "manual_rejected",
      });
      const { transactionId: inflowId } = await insertTransaction(db, householdId, savingsId, {
        date: "2026-05-10",
        normalizedAmount: 50000,
        amount: -50000,
        transferSource: "manual_rejected",
      });

      const tagged = await applyTransferDetection(householdId, db);
      expect(tagged).toBe(0);

      const rows = await db.select().from(transactions).where(eq(transactions.householdId, householdId));
      for (const id of [outflowId, inflowId]) {
        const row = rows.find((r) => r.id === id)!;
        expect(row.isTransfer).toBe(false);
        expect(row.transferPairId).toBeNull();
        expect(row.transferSource).toBe("manual_rejected");
      }
    } finally {
      await close();
    }
  });

  it("records transferSource 'auto' on pairs it tags itself", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db);
      const { accountId: checkingId } = await insertAccount(db, householdId, { type: "checking" });
      const { accountId: savingsId } = await insertAccount(db, householdId, { type: "savings" });

      await insertTransaction(db, householdId, checkingId, {
        date: "2026-05-10",
        normalizedAmount: -50000,
        amount: 50000,
      });
      await insertTransaction(db, householdId, savingsId, {
        date: "2026-05-10",
        normalizedAmount: 50000,
        amount: -50000,
      });

      expect(await applyTransferDetection(householdId, db)).toBe(1);

      const rows = await db.select().from(transactions).where(eq(transactions.householdId, householdId));
      expect(rows.every((r) => r.transferSource === "auto")).toBe(true);
    } finally {
      await close();
    }
  });

  it("is idempotent — a second call makes no further changes", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db);
      const { accountId: checkingId } = await insertAccount(db, householdId, { type: "checking" });
      const { accountId: savingsId } = await insertAccount(db, householdId, { type: "savings" });

      await insertTransaction(db, householdId, checkingId, {
        date: "2026-05-10",
        normalizedAmount: -50000,
        amount: 50000,
      });
      await insertTransaction(db, householdId, savingsId, {
        date: "2026-05-10",
        normalizedAmount: 50000,
        amount: -50000,
      });

      const firstRun = await applyTransferDetection(householdId, db);
      expect(firstRun).toBe(1);

      const secondRun = await applyTransferDetection(householdId, db);
      expect(secondRun).toBe(0);
    } finally {
      await close();
    }
  });

  it("does not tag an ordinary (non-transfer) expense", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db);
      const { accountId } = await insertAccount(db, householdId, { type: "checking" });

      const { transactionId: id } = await insertTransaction(db, householdId, accountId, {
        date: "2026-05-10",
        normalizedAmount: -3000,
        amount: 3000,
      });

      await applyTransferDetection(householdId, db);

      const [row] = await db.select().from(transactions).where(eq(transactions.id, id));
      expect(row.isTransfer).toBe(false);
      expect(row.transferPairId).toBeNull();
    } finally {
      await close();
    }
  });

  it("only tags transactions belonging to the given household", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db);
      const { householdId: otherHouseholdId } = await insertHousehold(db, "Other Household");

      const { accountId: checkingId } = await insertAccount(db, householdId, { type: "checking" });
      const { accountId: savingsId } = await insertAccount(db, householdId, { type: "savings" });
      const { accountId: otherCheckingId } = await insertAccount(db, otherHouseholdId, { type: "checking" });
      const { accountId: otherSavingsId } = await insertAccount(db, otherHouseholdId, { type: "savings" });

      await insertTransaction(db, householdId, checkingId, {
        date: "2026-05-10",
        normalizedAmount: -50000,
        amount: 50000,
      });
      await insertTransaction(db, householdId, savingsId, {
        date: "2026-05-10",
        normalizedAmount: 50000,
        amount: -50000,
      });

      const { transactionId: otherOutId } = await insertTransaction(db, otherHouseholdId, otherCheckingId, {
        date: "2026-05-10",
        normalizedAmount: -70000,
        amount: 70000,
      });
      const { transactionId: otherInId } = await insertTransaction(db, otherHouseholdId, otherSavingsId, {
        date: "2026-05-10",
        normalizedAmount: 70000,
        amount: -70000,
      });

      const tagged = await applyTransferDetection(householdId, db);
      expect(tagged).toBe(1);

      const [otherOut] = await db.select().from(transactions).where(eq(transactions.id, otherOutId));
      const [otherIn] = await db.select().from(transactions).where(eq(transactions.id, otherInId));
      expect(otherOut.isTransfer).toBe(false);
      expect(otherIn.isTransfer).toBe(false);
    } finally {
      await close();
    }
  });
});
