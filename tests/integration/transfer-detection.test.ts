import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./setup";
import { insertHousehold, insertAccount, insertTransaction, insertMerchant } from "./helpers";
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
      expect(tagged).toEqual({ pairs: 1, patterns: 0, suggested: 0 });

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
      expect(tagged).toEqual({ pairs: 0, patterns: 0, suggested: 0 });

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

      expect(await applyTransferDetection(householdId, db)).toEqual({ pairs: 1, patterns: 0, suggested: 0 });

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
      expect(firstRun).toEqual({ pairs: 1, patterns: 0, suggested: 0 });

      const secondRun = await applyTransferDetection(householdId, db);
      expect(secondRun).toEqual({ pairs: 0, patterns: 0, suggested: 0 });
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
      expect(tagged).toEqual({ pairs: 1, patterns: 0, suggested: 0 });

      const [otherOut] = await db.select().from(transactions).where(eq(transactions.id, otherOutId));
      const [otherIn] = await db.select().from(transactions).where(eq(transactions.id, otherInId));
      expect(otherOut.isTransfer).toBe(false);
      expect(otherIn.isTransfer).toBe(false);
    } finally {
      await close();
    }
  });
});

describe("applyTransferDetection — single-leg pattern pass", () => {
  it("tags a high-confidence name match immediately, with no pair", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db);
      const { accountId } = await insertAccount(db, householdId, { type: "checking" });
      const { transactionId } = await insertTransaction(db, householdId, accountId, {
        name: "Applecard Gsbank Payment Xxxxx4415",
        normalizedAmount: -6861,
        amount: 6861,
      });

      const result = await applyTransferDetection(householdId, db);
      expect(result).toEqual({ pairs: 0, patterns: 1, suggested: 0 });

      const [row] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
      expect(row.isTransfer).toBe(true);
      expect(row.transferPairId).toBeNull();
      expect(row.transferSource).toBe("pattern");
    } finally {
      await close();
    }
  });

  it("flags a low-confidence P2P name for review without touching isTransfer", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db);
      const { accountId } = await insertAccount(db, householdId, { type: "checking" });
      const { transactionId } = await insertTransaction(db, householdId, accountId, {
        name: "Zelle",
        normalizedAmount: -7000,
        amount: 7000,
      });

      const result = await applyTransferDetection(householdId, db);
      expect(result).toEqual({ pairs: 0, patterns: 0, suggested: 1 });

      const [row] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
      expect(row.isTransfer).toBe(false);
      expect(row.transferSource).toBe("suggested");
    } finally {
      await close();
    }
  });

  it("matches on merchant name as well as transaction name", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db);
      const { accountId } = await insertAccount(db, householdId, { type: "checking" });
      const { merchantId } = await insertMerchant(db, householdId, { name: "Venmo" });
      const { transactionId } = await insertTransaction(db, householdId, accountId, {
        name: "Venmo Payment",
        merchantId,
        normalizedAmount: -2500,
        amount: 2500,
      });

      await applyTransferDetection(householdId, db);

      const [row] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
      expect(row.transferSource).toBe("suggested");
    } finally {
      await close();
    }
  });

  it("never re-flags a transaction the user manually rejected", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db);
      const { accountId } = await insertAccount(db, householdId, { type: "checking" });
      const { transactionId } = await insertTransaction(db, householdId, accountId, {
        name: "Zelle",
        normalizedAmount: -7000,
        amount: 7000,
        isTransfer: false,
        transferSource: "manual_rejected",
      });

      const result = await applyTransferDetection(householdId, db);
      expect(result).toEqual({ pairs: 0, patterns: 0, suggested: 0 });

      const [row] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
      expect(row.transferSource).toBe("manual_rejected");
    } finally {
      await close();
    }
  });

  it("is idempotent — a repeat call does not re-count already-flagged rows", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db);
      const { accountId } = await insertAccount(db, householdId, { type: "checking" });
      await insertTransaction(db, householdId, accountId, {
        name: "Apple GS Savings Transfer",
        normalizedAmount: -70000,
        amount: 70000,
      });

      const first = await applyTransferDetection(householdId, db);
      expect(first.patterns).toBe(1);

      const second = await applyTransferDetection(householdId, db);
      expect(second).toEqual({ pairs: 0, patterns: 0, suggested: 0 });
    } finally {
      await close();
    }
  });

  it("prefers a real pair match over a name pattern when both apply", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db);
      const { accountId: checkingId } = await insertAccount(db, householdId, { type: "checking" });
      const { accountId: savingsId } = await insertAccount(db, householdId, { type: "savings" });
      const { transactionId: outId } = await insertTransaction(db, householdId, checkingId, {
        name: "Transfer to Savings",
        date: "2026-05-10",
        normalizedAmount: -10000,
        amount: 10000,
      });
      const { transactionId: inId } = await insertTransaction(db, householdId, savingsId, {
        name: "Transfer from Checking",
        date: "2026-05-10",
        normalizedAmount: 10000,
        amount: -10000,
      });

      const result = await applyTransferDetection(householdId, db);
      expect(result).toEqual({ pairs: 1, patterns: 0, suggested: 0 });

      const [out] = await db.select().from(transactions).where(eq(transactions.id, outId));
      expect(out.transferSource).toBe("auto");
      expect(out.transferPairId).toBe(inId);
    } finally {
      await close();
    }
  });
});
