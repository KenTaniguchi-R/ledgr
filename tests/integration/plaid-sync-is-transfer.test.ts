import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "./setup";
import { insertHousehold, insertAccount, insertTransaction } from "./helpers";
import { transactions } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import type { LedgrDb } from "../../src/db";

describe("isTransfer population during sync", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;
  let householdId: string;
  let accountId: string;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    ({ householdId } = await insertHousehold(db));
    ({ accountId } = await insertAccount(db, householdId));
  });

  afterAll(async () => {
    await close();
  });

  it("sets isTransfer true for TRANSFER_IN pfc_primary", async () => {
    const { transactionId } = await insertTransaction(db, householdId, accountId, {
      pfcPrimary: "TRANSFER_IN",
      isTransfer: true,
    });

    const [row] = await db
      .select({ isTransfer: transactions.isTransfer })
      .from(transactions)
      .where(eq(transactions.id, transactionId));

    expect(row?.isTransfer).toBe(true);
  });

  it("sets isTransfer false for non-transfer categories", async () => {
    const { transactionId } = await insertTransaction(db, householdId, accountId, {
      pfcPrimary: "FOOD_AND_DRINK",
      isTransfer: false,
    });

    const [row] = await db
      .select({ isTransfer: transactions.isTransfer })
      .from(transactions)
      .where(eq(transactions.id, transactionId));

    expect(row?.isTransfer).toBe(false);
  });
});
