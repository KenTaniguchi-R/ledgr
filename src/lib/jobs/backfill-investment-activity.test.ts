import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../../tests/integration/setup";
import { insertHousehold, insertAccount, insertTransaction } from "../../../tests/integration/helpers";
import { backfillInvestmentActivity } from "./backfill-investment-activity";
import { transactions } from "@/db/schema";

describe("backfillInvestmentActivity", () => {
  it("tags historical investment-account transactions and skips manual_rejected rows", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db);
      const { accountId: investmentAccountId } = await insertAccount(db, householdId, { type: "investment" });
      const { accountId: checkingId } = await insertAccount(db, householdId, { type: "checking" });

      const { transactionId: fillId } = await insertTransaction(db, householdId, investmentAccountId, {
        name: "Buy XPO Fill",
      });
      const { transactionId: correctedId } = await insertTransaction(db, householdId, investmentAccountId, {
        name: "Buy Sphr Fill",
        isTransfer: false,
        transferSource: "manual_rejected",
      });
      const { transactionId: checkingTxnId } = await insertTransaction(db, householdId, checkingId, {
        name: "Grocery Store",
      });

      const result = await backfillInvestmentActivity(db);

      expect(result.households).toBe(1);
      expect(result.tagged).toBe(1);

      const [fill] = await db.select().from(transactions).where(eq(transactions.id, fillId));
      expect(fill.isTransfer).toBe(true);
      expect(fill.transferSource).toBe("investment_account");

      const [corrected] = await db.select().from(transactions).where(eq(transactions.id, correctedId));
      expect(corrected.isTransfer).toBe(false);
      expect(corrected.transferSource).toBe("manual_rejected");

      const [checkingTxn] = await db.select().from(transactions).where(eq(transactions.id, checkingTxnId));
      expect(checkingTxn.isTransfer).toBe(false);
      expect(checkingTxn.transferSource).toBeNull();
    } finally {
      await close();
    }
  });

  it("is safe to re-run — already-tagged rows are skipped", async () => {
    const { db, close } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db);
      const { accountId: investmentAccountId } = await insertAccount(db, householdId, { type: "investment" });
      await insertTransaction(db, householdId, investmentAccountId, { name: "Buy XPO Fill" });

      const first = await backfillInvestmentActivity(db);
      expect(first.tagged).toBe(1);

      const second = await backfillInvestmentActivity(db);
      expect(second.tagged).toBe(0);
    } finally {
      await close();
    }
  });
});
