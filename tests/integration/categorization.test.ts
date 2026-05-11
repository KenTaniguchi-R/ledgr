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
import type { LedgrDb } from "../../src/db";

describe("categorizeSyncedTransactions — PFC tier integration", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());

    await db.insert(households).values({ id: "hh-1", name: "Test Household" });
    await seedDefaultCategories(db, "hh-1");

    await db.insert(plaidItems).values({
      id: "item-1",
      householdId: "hh-1",
      plaidInstitutionId: "ins_1",
      institutionName: "Test Bank",
      accessToken: "encrypted-token",
      status: "active",
    });

    await db.insert(accounts).values({
      id: "acc-1",
      householdId: "hh-1",
      name: "Checking",
      type: "checking",
      plaidItemId: "item-1",
    });
  });

  afterEach(async () => {
    await close();
  });

  it("categorizes transactions via PFC detailed codes", async () => {
    await db.insert(transactions).values({
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
    });

    await categorizeSyncedTransactions("item-1", "hh-1", db);

    const [txn] = await db
      .select({
        categoryId: transactions.categoryId,
        categorySource: transactions.categorySource,
      })
      .from(transactions)
      .where(eq(transactions.id, "txn-1"));

    const [groceriesCat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.householdId, "hh-1"),
          eq(categories.name, "Groceries"),
        ),
      );

    expect(txn?.categoryId).toBe(groceriesCat?.id);
    expect(txn?.categorySource).toBe("pfc");
  });

  it("transactions with null pfcDetailed pass through without error", async () => {
    await db.insert(transactions).values({
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
    });

    await categorizeSyncedTransactions("item-1", "hh-1", db);

    const [txn] = await db
      .select({ categoryId: transactions.categoryId })
      .from(transactions)
      .where(eq(transactions.id, "txn-null"));

    expect(txn?.categoryId).toBeNull();
  });

  it("isolates PFC resolution between households", async () => {
    await db.insert(households).values({ id: "hh-2", name: "Household Two" });
    await seedDefaultCategories(db, "hh-2");

    await db.insert(plaidItems).values({
      id: "item-2",
      householdId: "hh-2",
      plaidInstitutionId: "ins_2",
      institutionName: "Test Bank 2",
      accessToken: "encrypted-token-2",
      status: "active",
    });

    await db.insert(accounts).values({
      id: "acc-2",
      householdId: "hh-2",
      name: "Checking 2",
      type: "checking",
      plaidItemId: "item-2",
    });

    await db.insert(transactions).values([
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
    ]);

    await categorizeSyncedTransactions("item-1", "hh-1", db);
    await categorizeSyncedTransactions("item-2", "hh-2", db);

    const [txn1] = await db
      .select({ categoryId: transactions.categoryId })
      .from(transactions)
      .where(eq(transactions.id, "txn-hh1"));
    const [txn2] = await db
      .select({ categoryId: transactions.categoryId })
      .from(transactions)
      .where(eq(transactions.id, "txn-hh2"));

    expect(txn1?.categoryId).not.toBeNull();
    expect(txn2?.categoryId).not.toBeNull();
    expect(txn1?.categoryId).not.toBe(txn2?.categoryId);

    const [coffee1] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.householdId, "hh-1"),
          eq(categories.name, "Coffee Shops"),
        ),
      );
    const [coffee2] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.householdId, "hh-2"),
          eq(categories.name, "Coffee Shops"),
        ),
      );

    expect(txn1?.categoryId).toBe(coffee1?.id);
    expect(txn2?.categoryId).toBe(coffee2?.id);
  });
});
