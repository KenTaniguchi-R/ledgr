import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertTransaction,
  insertCategoryGroup,
  insertCategory,
} from "./helpers";
import {
  updateTransactionCategory,
  toggleReviewed,
  bulkUpdateCategory,
  bulkMarkReviewed,
} from "../../src/actions/transactions";
import { transactions } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import type { LedgrDb } from "../../src/db";

// Mock auth + revalidation
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let mockHouseholdId: string;
vi.mock("../../src/lib/auth/session", () => ({
  getHouseholdId: vi.fn(() => Promise.resolve(mockHouseholdId)),
}));

describe("transaction actions", () => {
  let db: LedgrDb;
  let close: () => void;
  let accountId: string;
  let categoryId: string;
  let txnId: string;

  beforeAll(() => {
    const testDb = createTestDb();
    db = testDb.db;
    close = testDb.close;

    const hh = insertHousehold(db);
    mockHouseholdId = hh.householdId;
    ({ accountId } = insertAccount(db, hh.householdId));
    const { groupId } = insertCategoryGroup(db, hh.householdId);
    ({ categoryId } = insertCategory(db, hh.householdId, groupId, { name: "Groceries" }));
  });

  afterAll(() => close());

  describe("updateTransactionCategory", () => {
    it("sets categoryId and marks reviewed=true", async () => {
      const { transactionId } = insertTransaction(db, mockHouseholdId, accountId);
      txnId = transactionId;

      const result = await updateTransactionCategory(transactionId, categoryId, db);
      expect(result).toEqual({ success: true });

      const row = db.select().from(transactions).where(eq(transactions.id, transactionId)).get();
      expect(row!.categoryId).toBe(categoryId);
      expect(row!.reviewed).toBe(true);
    });

    it("clearing category (null) sets reviewed to false", async () => {
      const result = await updateTransactionCategory(txnId, null, db);
      expect(result).toEqual({ success: true });

      const row = db.select().from(transactions).where(eq(transactions.id, txnId)).get();
      expect(row!.categoryId).toBeNull();
      expect(row!.reviewed).toBe(false);
    });
  });

  describe("toggleReviewed", () => {
    it("flips reviewed boolean and returns new value", async () => {
      const { transactionId } = insertTransaction(db, mockHouseholdId, accountId, { reviewed: false });

      const result = await toggleReviewed(transactionId, db);
      expect(result).toEqual({ success: true, reviewed: true });

      const result2 = await toggleReviewed(transactionId, db);
      expect(result2).toEqual({ success: true, reviewed: false });
    });
  });

  describe("bulkUpdateCategory", () => {
    it("only updates transactions belonging to the session household", async () => {
      const { transactionId: ownTxn } = insertTransaction(db, mockHouseholdId, accountId);

      const { householdId: otherId } = insertHousehold(db, "Other");
      const { accountId: otherAcct } = insertAccount(db, otherId);
      const { transactionId: otherTxn } = insertTransaction(db, otherId, otherAcct);

      const result = await bulkUpdateCategory([ownTxn, otherTxn], categoryId, db);
      expect(result).toEqual({ success: true, updatedCount: 1 });

      const otherRow = db.select().from(transactions).where(eq(transactions.id, otherTxn)).get();
      expect(otherRow!.categoryId).toBeNull();
    });

    it("returns error when exceeding 500 items", async () => {
      const ids = Array.from({ length: 501 }, (_, i) => `fake-id-${i}`);
      const result = await bulkUpdateCategory(ids, categoryId, db);
      expect(result).toHaveProperty("error");
    });
  });

  describe("bulkMarkReviewed", () => {
    it("marks multiple transactions as reviewed", async () => {
      const { transactionId: t1 } = insertTransaction(db, mockHouseholdId, accountId, { reviewed: false });
      const { transactionId: t2 } = insertTransaction(db, mockHouseholdId, accountId, { reviewed: false });

      const result = await bulkMarkReviewed([t1, t2], true, db);
      expect(result).toEqual({ success: true, updatedCount: 2 });
    });
  });
});
