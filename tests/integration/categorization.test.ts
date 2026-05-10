import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq, and } from "drizzle-orm";
import { createTestDb } from "./setup";
import { seedDefaultCategories } from "../../src/db/seed/categories";
import { categorizeSyncedTransactions } from "../../src/lib/categorization/engine";
import {
  households,
  accounts,
  transactions,
  categories,
  plaidItems,
} from "../../src/db/schema";

describe("categorizeSyncedTransactions — PFC tier integration", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let close: () => void;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    close = testDb.close;

    db.insert(households).values({ id: "hh-1", name: "Test Household" }).run();
    seedDefaultCategories(db, "hh-1");

    db.insert(plaidItems)
      .values({
        id: "item-1",
        householdId: "hh-1",
        institutionId: "ins_1",
        institutionName: "Test Bank",
        accessToken: "encrypted-token",
        status: "active",
      })
      .run();

    db.insert(accounts)
      .values({
        id: "acc-1",
        householdId: "hh-1",
        name: "Checking",
        type: "checking",
        plaidItemId: "item-1",
      })
      .run();
  });

  afterEach(() => close());

  it("categorizes transactions via PFC detailed codes", () => {
    db.insert(transactions)
      .values({
        id: "txn-1",
        accountId: "acc-1",
        householdId: "hh-1",
        date: "2026-01-15",
        originalName: "WHOLE FOODS MKT",
        name: "Whole Foods",
        amount: 5000,
        normalizedAmount: -5000,
        pfcPrimary: "FOOD_AND_DRINK",
        pfcDetailed: "FOOD_AND_DRINK_GROCERIES",
      })
      .run();

    categorizeSyncedTransactions("item-1", "hh-1", db);

    const txn = db
      .select({
        categoryId: transactions.categoryId,
        categorySource: transactions.categorySource,
      })
      .from(transactions)
      .where(eq(transactions.id, "txn-1"))
      .get();

    const groceriesCat = db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.householdId, "hh-1"),
          eq(categories.name, "Groceries"),
        ),
      )
      .get();

    expect(txn?.categoryId).toBe(groceriesCat?.id);
    expect(txn?.categorySource).toBe("pfc");
  });

  it("transactions with null pfcDetailed pass through without error", () => {
    db.insert(transactions)
      .values({
        id: "txn-null",
        accountId: "acc-1",
        householdId: "hh-1",
        date: "2026-01-15",
        originalName: "MYSTERY CHARGE",
        name: "Mystery Charge",
        amount: 1000,
        normalizedAmount: -1000,
        pfcPrimary: null,
        pfcDetailed: null,
      })
      .run();

    categorizeSyncedTransactions("item-1", "hh-1", db);

    const txn = db
      .select({ categoryId: transactions.categoryId })
      .from(transactions)
      .where(eq(transactions.id, "txn-null"))
      .get();

    expect(txn?.categoryId).toBeNull();
  });

  it("isolates PFC resolution between households", () => {
    db.insert(households).values({ id: "hh-2", name: "Household Two" }).run();
    seedDefaultCategories(db, "hh-2");

    db.insert(plaidItems)
      .values({
        id: "item-2",
        householdId: "hh-2",
        institutionId: "ins_2",
        institutionName: "Test Bank 2",
        accessToken: "encrypted-token-2",
        status: "active",
      })
      .run();

    db.insert(accounts)
      .values({
        id: "acc-2",
        householdId: "hh-2",
        name: "Checking 2",
        type: "checking",
        plaidItemId: "item-2",
      })
      .run();

    db.insert(transactions)
      .values([
        {
          id: "txn-hh1",
          accountId: "acc-1",
          householdId: "hh-1",
          date: "2026-01-15",
          originalName: "STARBUCKS",
          name: "Starbucks",
          amount: 500,
          normalizedAmount: -500,
          pfcDetailed: "FOOD_AND_DRINK_COFFEE",
        },
        {
          id: "txn-hh2",
          accountId: "acc-2",
          householdId: "hh-2",
          date: "2026-01-15",
          originalName: "STARBUCKS",
          name: "Starbucks",
          amount: 500,
          normalizedAmount: -500,
          pfcDetailed: "FOOD_AND_DRINK_COFFEE",
        },
      ])
      .run();

    categorizeSyncedTransactions("item-1", "hh-1", db);
    categorizeSyncedTransactions("item-2", "hh-2", db);

    const txn1 = db
      .select({ categoryId: transactions.categoryId })
      .from(transactions)
      .where(eq(transactions.id, "txn-hh1"))
      .get();
    const txn2 = db
      .select({ categoryId: transactions.categoryId })
      .from(transactions)
      .where(eq(transactions.id, "txn-hh2"))
      .get();

    expect(txn1?.categoryId).not.toBeNull();
    expect(txn2?.categoryId).not.toBeNull();
    expect(txn1?.categoryId).not.toBe(txn2?.categoryId);

    const coffee1 = db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.householdId, "hh-1"),
          eq(categories.name, "Coffee Shops"),
        ),
      )
      .get();
    const coffee2 = db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.householdId, "hh-2"),
          eq(categories.name, "Coffee Shops"),
        ),
      )
      .get();

    expect(txn1?.categoryId).toBe(coffee1?.id);
    expect(txn2?.categoryId).toBe(coffee2?.id);
  });
});
