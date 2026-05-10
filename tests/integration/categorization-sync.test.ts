import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { v4 as uuid } from "uuid";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertTransaction,
  insertMerchant,
  insertCategoryGroup,
  insertCategory,
  insertCategoryRule,
} from "./helpers";
import { categorizeSyncedTransactions } from "../../src/lib/categorization/engine";
import { transactions, plaidItems } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import type { LedgrDb } from "../../src/db";

describe("categorizeSyncedTransactions", () => {
  let db: LedgrDb;
  let close: () => void;
  let householdId: string;
  let accountId: string;
  let plaidItemId: string;

  beforeAll(() => {
    const testDb = createTestDb();
    db = testDb.db;
    close = testDb.close;

    ({ householdId } = insertHousehold(db));
    plaidItemId = uuid();
    db.insert(plaidItems).values({
      id: plaidItemId,
      householdId,
      accessToken: "encrypted-token",
      status: "active",
    }).run();
    ({ accountId } = insertAccount(db, householdId, { plaidItemId }));
  });

  afterAll(() => close());

  it("applies matching rule to uncategorized transactions", () => {
    const { groupId } = insertCategoryGroup(db, householdId, { name: "Food" });
    const { categoryId } = insertCategory(db, householdId, groupId, { name: "Groceries" });
    insertCategoryRule(db, householdId, categoryId, { matchField: "name", matchPattern: "whole foods" });

    const { transactionId } = insertTransaction(db, householdId, accountId, { name: "Whole Foods Market" });

    categorizeSyncedTransactions(plaidItemId, householdId, db);

    const row = db.select().from(transactions).where(eq(transactions.id, transactionId)).get();
    expect(row!.categoryId).toBe(categoryId);
  });

  it("respects rule priority — higher wins", () => {
    const { groupId } = insertCategoryGroup(db, householdId, { name: "Drinks" });
    const { categoryId: catLow } = insertCategory(db, householdId, groupId, { name: "Dining" });
    const { categoryId: catHigh } = insertCategory(db, householdId, groupId, { name: "Coffee" });
    insertCategoryRule(db, householdId, catLow, { matchPattern: "starbucks", priority: 0 });
    insertCategoryRule(db, householdId, catHigh, { matchPattern: "starbucks", priority: 10 });

    const { transactionId } = insertTransaction(db, householdId, accountId, { name: "Starbucks #42" });

    categorizeSyncedTransactions(plaidItemId, householdId, db);

    const row = db.select().from(transactions).where(eq(transactions.id, transactionId)).get();
    expect(row!.categoryId).toBe(catHigh);
  });

  it("falls back to merchant default category", () => {
    const { groupId } = insertCategoryGroup(db, householdId, { name: "Subs" });
    const { categoryId } = insertCategory(db, householdId, groupId, { name: "Subscriptions" });
    const { merchantId } = insertMerchant(db, householdId, { name: "Netflix", categoryId });

    const { transactionId } = insertTransaction(db, householdId, accountId, {
      name: "NETFLIX.COM",
      merchantId,
    });

    categorizeSyncedTransactions(plaidItemId, householdId, db);

    const row = db.select().from(transactions).where(eq(transactions.id, transactionId)).get();
    expect(row!.categoryId).toBe(categoryId);
  });

  it("never overwrites an existing manual category assignment", () => {
    const { groupId } = insertCategoryGroup(db, householdId, { name: "Manual" });
    const { categoryId: manualCat } = insertCategory(db, householdId, groupId, { name: "Manual Cat" });
    const { categoryId: ruleCat } = insertCategory(db, householdId, groupId, { name: "Rule Cat" });
    insertCategoryRule(db, householdId, ruleCat, { matchPattern: "manual-test" });

    const { transactionId } = insertTransaction(db, householdId, accountId, {
      name: "manual-test store",
      categoryId: manualCat,
    });

    categorizeSyncedTransactions(plaidItemId, householdId, db);

    const row = db.select().from(transactions).where(eq(transactions.id, transactionId)).get();
    expect(row!.categoryId).toBe(manualCat);
  });

  it("categorization failure does not throw", () => {
    expect(() => {
      categorizeSyncedTransactions("nonexistent-item", householdId, db);
    }).not.toThrow();
  });
});
