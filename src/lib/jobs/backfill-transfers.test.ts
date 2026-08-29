import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../../tests/integration/setup";
import { insertHousehold, insertAccount, insertTransaction } from "../../../tests/integration/helpers";
import { backfillTransfers } from "./backfill-transfers";
import { transactions } from "@/db/schema";

describe("backfillTransfers", () => {
  it("tags matching pairs across every household", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId: hh1 } = await insertHousehold(db, "Household 1");
      const { accountId: hh1Checking } = await insertAccount(db, hh1, { type: "checking" });
      const { accountId: hh1Savings } = await insertAccount(db, hh1, { type: "savings" });
      const { transactionId: hh1Out } = await insertTransaction(db, hh1, hh1Checking, {
        date: "2026-05-10",
        normalizedAmount: -20000,
        amount: 20000,
      });
      const { transactionId: hh1In } = await insertTransaction(db, hh1, hh1Savings, {
        date: "2026-05-10",
        normalizedAmount: 20000,
        amount: -20000,
      });

      const { householdId: hh2 } = await insertHousehold(db, "Household 2");
      const { accountId: hh2Checking } = await insertAccount(db, hh2, { type: "checking" });
      const { accountId: hh2Savings } = await insertAccount(db, hh2, { type: "savings" });
      await insertTransaction(db, hh2, hh2Checking, {
        date: "2026-05-11",
        normalizedAmount: -8000,
        amount: 8000,
      });
      await insertTransaction(db, hh2, hh2Savings, {
        date: "2026-05-11",
        normalizedAmount: 8000,
        amount: -8000,
      });

      const result = await backfillTransfers(db);

      expect(result.households).toBe(2);
      expect(result.tagged).toBe(2);

      const [out] = await db.select().from(transactions).where(eq(transactions.id, hh1Out));
      const [inflow] = await db.select().from(transactions).where(eq(transactions.id, hh1In));
      expect(out.isTransfer).toBe(true);
      expect(inflow.transferPairId).toBe(hh1Out);
    } finally {
      await close();
    }
  });

  it("is safe to re-run — already-tagged pairs are skipped", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db);
      const { accountId: checkingId } = await insertAccount(db, householdId, { type: "checking" });
      const { accountId: savingsId } = await insertAccount(db, householdId, { type: "savings" });
      await insertTransaction(db, householdId, checkingId, {
        date: "2026-05-10",
        normalizedAmount: -20000,
        amount: 20000,
      });
      await insertTransaction(db, householdId, savingsId, {
        date: "2026-05-10",
        normalizedAmount: 20000,
        amount: -20000,
      });

      const first = await backfillTransfers(db);
      expect(first.tagged).toBe(1);

      const second = await backfillTransfers(db);
      expect(second.tagged).toBe(0);
    } finally {
      await close();
    }
  });
});
