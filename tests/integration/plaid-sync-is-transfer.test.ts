import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "./setup";
import { insertHousehold, insertAccount, insertTransaction } from "./helpers";
import { transactions } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import type { LedgrDb } from "../../src/db";

describe("isTransfer population during sync", () => {
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
  });

  afterAll(() => close());

  it("sets isTransfer true for TRANSFER_IN pfc_primary", () => {
    const { transactionId } = insertTransaction(db, householdId, accountId, {
      pfcPrimary: "TRANSFER_IN",
      isTransfer: true,
    });

    const row = db
      .select({ isTransfer: transactions.isTransfer })
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .get();

    expect(row?.isTransfer).toBe(true);
  });

  it("sets isTransfer false for non-transfer categories", () => {
    const { transactionId } = insertTransaction(db, householdId, accountId, {
      pfcPrimary: "FOOD_AND_DRINK",
      isTransfer: false,
    });

    const row = db
      .select({ isTransfer: transactions.isTransfer })
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .get();

    expect(row?.isTransfer).toBe(false);
  });
});
