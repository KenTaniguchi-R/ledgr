import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertTransaction,
  insertCategoryGroup,
  insertCategory,
  insertTransactionSplit,
} from "./helpers";
import { aggregateSpending, enrichSpendingMap } from "../../src/lib/spending-helpers";
import type { ReportFilters } from "../../src/queries/reports";
import type { LedgrDb } from "../../src/db";

let db: LedgrDb;
let close: () => Promise<void>;
let householdId: string;
let accountId: string;
let groupId: string;
let foodCatId: string;
let rentCatId: string;
let incomeCatId: string;

// May window; all fixture expenses land on 2026-05-01 by default.
const filters: ReportFilters = { dateFrom: "2026-05-01", dateTo: "2026-05-31" };

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  ({ householdId } = await insertHousehold(db));
  ({ accountId } = await insertAccount(db, householdId));
  ({ groupId } = await insertCategoryGroup(db, householdId, { name: "Living" }));
  ({ categoryId: foodCatId } = await insertCategory(db, householdId, groupId, { name: "Food" }));
  ({ categoryId: rentCatId } = await insertCategory(db, householdId, groupId, { name: "Rent" }));
  const incGroup = await insertCategoryGroup(db, householdId, { name: "Income" });
  ({ categoryId: incomeCatId } = await insertCategory(db, householdId, incGroup.groupId, {
    name: "Paycheck",
    isIncome: true,
  }));
});

afterEach(async () => {
  await close();
});

// An "expense" for these helpers means normalizedAmount < 0.
async function expense(overrides: Record<string, unknown> = {}) {
  return insertTransaction(db, householdId, accountId, {
    normalizedAmount: -1000,
    ...overrides,
  });
}

describe("aggregateSpending", () => {
  test("sums absolute spend per category", async () => {
    await expense({ categoryId: foodCatId, normalizedAmount: -1000 });
    await expense({ categoryId: foodCatId, normalizedAmount: -500 });
    await expense({ categoryId: rentCatId, normalizedAmount: -2000 });

    const result = await aggregateSpending(householdId, filters, db);

    expect(result.get(foodCatId)).toBe(1500);
    expect(result.get(rentCatId)).toBe(2000);
  });

  test("groups null-category spend under 'uncategorized'", async () => {
    await expense({ categoryId: null, normalizedAmount: -750 });

    const result = await aggregateSpending(householdId, filters, db);

    expect(result.get("uncategorized")).toBe(750);
  });

  test("excludes income, transfers, pending, deleted, paired, and out-of-range rows", async () => {
    await expense({ categoryId: foodCatId, normalizedAmount: -1000 }); // the only one that counts
    await expense({ categoryId: incomeCatId, normalizedAmount: -9999 }); // income category
    await expense({ categoryId: foodCatId, normalizedAmount: 5000 }); // positive → not spend
    await expense({ categoryId: foodCatId, normalizedAmount: -9999, isTransfer: true });
    await expense({ categoryId: foodCatId, normalizedAmount: -9999, pending: true });
    await expense({ categoryId: foodCatId, normalizedAmount: -9999, deletedAt: new Date() });
    await expense({ categoryId: foodCatId, normalizedAmount: -9999, transferPairId: "some-pair" });
    await expense({ categoryId: foodCatId, normalizedAmount: -9999, date: "2026-06-15" }); // out of window

    const result = await aggregateSpending(householdId, filters, db);

    expect(result.get(foodCatId)).toBe(1000);
    expect(result.has(incomeCatId)).toBe(false);
    expect([...result.values()].reduce((a, b) => a + b, 0)).toBe(1000);
  });

  test("attributes split transactions to their split categories, not the parent", async () => {
    const { transactionId } = await expense({ categoryId: foodCatId, normalizedAmount: -3000 });
    await insertTransactionSplit(db, transactionId, foodCatId, 1000);
    await insertTransactionSplit(db, transactionId, rentCatId, 2000);

    const result = await aggregateSpending(householdId, filters, db);

    // Parent's -3000 is NOT counted once; splits supply the breakdown.
    expect(result.get(foodCatId)).toBe(1000);
    expect(result.get(rentCatId)).toBe(2000);
  });

  test("isolates spend by household", async () => {
    const other = await insertHousehold(db, "Other");
    const otherAccount = await insertAccount(db, other.householdId);
    await insertTransaction(db, other.householdId, otherAccount.accountId, {
      categoryId: null,
      normalizedAmount: -5000,
    });
    await expense({ categoryId: foodCatId, normalizedAmount: -1000 });

    const result = await aggregateSpending(householdId, filters, db);

    expect(result.get(foodCatId)).toBe(1000);
    expect([...result.values()].reduce((a, b) => a + b, 0)).toBe(1000);
  });

  test("honors the accountIds filter", async () => {
    const second = await insertAccount(db, householdId, { name: "Second" });
    await expense({ categoryId: foodCatId, normalizedAmount: -1000 }); // default account
    await insertTransaction(db, householdId, second.accountId, {
      categoryId: foodCatId,
      normalizedAmount: -4000,
    });

    const scoped = await aggregateSpending(
      householdId,
      { ...filters, accountIds: [second.accountId] },
      db,
    );

    expect(scoped.get(foodCatId)).toBe(4000);
  });
});

describe("enrichSpendingMap", () => {
  test("resolves category name + group and labels the uncategorized bucket", async () => {
    const spending = new Map<string, number>([
      [foodCatId, 1500],
      ["uncategorized", 500],
    ]);

    const result = await enrichSpendingMap(spending, db);

    const food = result.find((r) => r.id === foodCatId);
    expect(food).toMatchObject({ name: "Food", groupName: "Living", groupId, value: 1500 });

    const uncategorized = result.find((r) => r.id === null);
    expect(uncategorized).toMatchObject({ name: "Uncategorized", value: 500, groupName: null });
  });

  test("labels an unknown category id as 'Unknown'", async () => {
    const spending = new Map<string, number>([["missing-cat-id", 200]]);

    const result = await enrichSpendingMap(spending, db);

    expect(result[0]).toMatchObject({ id: "missing-cat-id", name: "Unknown", groupName: null });
  });

  test("sorts descending by value", async () => {
    const spending = new Map<string, number>([
      [foodCatId, 100],
      [rentCatId, 900],
      ["uncategorized", 500],
    ]);

    const result = await enrichSpendingMap(spending, db);

    expect(result.map((r) => r.value)).toEqual([900, 500, 100]);
  });
});
