import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertTransaction,
  insertCategoryGroup,
  insertCategory,
  insertMerchant,
} from "./helpers";
import {
  updateTransactionCategory,
  toggleReviewed,
  bulkUpdateCategory,
  bulkMarkReviewed,
} from "../../src/actions/transactions";
import { transactions, merchants } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import type { LedgrDb } from "../../src/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../src/lib/demo-mode", () => ({ guardDemoMode: vi.fn(() => null) }));

const mockUserId = "test-user-id";
let mockHouseholdId: string;
vi.mock("../../src/lib/auth/session", () => ({
  getHouseholdId: vi.fn(() => Promise.resolve(mockHouseholdId)),
  getSession: vi.fn(() => Promise.resolve({ user: { id: mockUserId } })),
}));

describe("transaction actions", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;
  let accountId: string;
  let categoryId: string;
  let secondCategoryId: string;
  let txnId: string;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());

    const hh = await insertHousehold(db);
    mockHouseholdId = hh.householdId;
    ({ accountId } = await insertAccount(db, hh.householdId));
    const { groupId } = await insertCategoryGroup(db, hh.householdId);
    ({ categoryId } = await insertCategory(db, hh.householdId, groupId, { name: "Groceries" }));
    ({ categoryId: secondCategoryId } = await insertCategory(db, hh.householdId, groupId, { name: "Restaurants" }));
  });

  afterAll(async () => {
    await close();
  });

  describe("updateTransactionCategory", () => {
    it("sets categoryId and marks reviewed=true", async () => {
      const { transactionId } = await insertTransaction(db, mockHouseholdId, accountId);
      txnId = transactionId;

      const result = await updateTransactionCategory(transactionId, categoryId, db);
      expect(result).toEqual({ success: true });

      const [row] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
      expect(row!.categoryId).toBe(categoryId);
      expect(row!.reviewed).toBe(true);
    });

    it("clearing category (null) sets reviewed to false", async () => {
      const result = await updateTransactionCategory(txnId, null, db);
      expect(result).toEqual({ success: true });

      const [row] = await db.select().from(transactions).where(eq(transactions.id, txnId));
      expect(row!.categoryId).toBeNull();
      expect(row!.reviewed).toBe(false);
    });

    it("also sets the merchant's default category so future syncs pick it up (ISSUE-004)", async () => {
      const { merchantId } = await insertMerchant(db, mockHouseholdId);
      const { transactionId } = await insertTransaction(db, mockHouseholdId, accountId, { merchantId });

      const result = await updateTransactionCategory(transactionId, categoryId, db);
      expect(result).toEqual({ success: true });

      const [merchantRow] = await db.select().from(merchants).where(eq(merchants.id, merchantId));
      expect(merchantRow!.categoryId).toBe(categoryId);
    });

    it("does not clear the merchant's default category when clearing a transaction's category", async () => {
      const { merchantId } = await insertMerchant(db, mockHouseholdId, { categoryId });
      const { transactionId } = await insertTransaction(db, mockHouseholdId, accountId, {
        merchantId,
        categoryId,
      });

      const result = await updateTransactionCategory(transactionId, null, db);
      expect(result).toEqual({ success: true });

      const [merchantRow] = await db.select().from(merchants).where(eq(merchants.id, merchantId));
      expect(merchantRow!.categoryId).toBe(categoryId);
    });

    it("leaves merchants untouched when the transaction has no merchant", async () => {
      const { transactionId } = await insertTransaction(db, mockHouseholdId, accountId);

      const result = await updateTransactionCategory(transactionId, categoryId, db);
      expect(result).toEqual({ success: true });

      const [row] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
      expect(row!.categoryId).toBe(categoryId);
    });

    it("flags a conflict instead of overwriting the merchant's existing different default", async () => {
      const { merchantId } = await insertMerchant(db, mockHouseholdId, { categoryId });
      const { transactionId } = await insertTransaction(db, mockHouseholdId, accountId, { merchantId });

      const result = await updateTransactionCategory(transactionId, secondCategoryId, db);
      expect(result).toEqual({
        success: true,
        merchantCategoryConflict: { merchantId, currentCategoryId: categoryId },
      });

      const [row] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
      expect(row!.categoryId).toBe(secondCategoryId);

      const [merchantRow] = await db.select().from(merchants).where(eq(merchants.id, merchantId));
      expect(merchantRow!.categoryId).toBe(categoryId);
    });

    it("does not report a conflict when the new category matches the merchant's existing default", async () => {
      const { merchantId } = await insertMerchant(db, mockHouseholdId, { categoryId });
      const { transactionId } = await insertTransaction(db, mockHouseholdId, accountId, { merchantId });

      const result = await updateTransactionCategory(transactionId, categoryId, db);
      expect(result).toEqual({ success: true });
    });
  });

  describe("toggleReviewed", () => {
    it("flips reviewed boolean and returns new value", async () => {
      const { transactionId } = await insertTransaction(db, mockHouseholdId, accountId, { reviewed: false });

      const result = await toggleReviewed(transactionId, db);
      expect(result).toEqual({ success: true, reviewed: true });

      const result2 = await toggleReviewed(transactionId, db);
      expect(result2).toEqual({ success: true, reviewed: false });
    });
  });

  describe("bulkUpdateCategory", () => {
    it("only updates transactions belonging to the session household", async () => {
      const { transactionId: ownTxn } = await insertTransaction(db, mockHouseholdId, accountId);

      const { householdId: otherId } = await insertHousehold(db, "Other");
      const { accountId: otherAcct } = await insertAccount(db, otherId);
      const { transactionId: otherTxn } = await insertTransaction(db, otherId, otherAcct);

      const result = await bulkUpdateCategory([ownTxn, otherTxn], categoryId, db);
      expect(result).toEqual({ success: true, updatedCount: 1 });

      const [otherRow] = await db.select().from(transactions).where(eq(transactions.id, otherTxn));
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
      const { transactionId: t1 } = await insertTransaction(db, mockHouseholdId, accountId, { reviewed: false });
      const { transactionId: t2 } = await insertTransaction(db, mockHouseholdId, accountId, { reviewed: false });

      const result = await bulkMarkReviewed([t1, t2], true, db);
      expect(result).toEqual({ success: true, updatedCount: 2 });
    });
  });
});
