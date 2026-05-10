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
import type { LedgrDb } from "../../src/db";

let db: LedgrDb;
let close: () => void;
let householdId: string;
let accountId: string;
let foodCatId: string;
let rentCatId: string;
let incomeCatId: string;
let groupId: string;

beforeEach(() => {
  const testDb = createTestDb();
  db = testDb.db;
  close = testDb.close;

  ({ householdId } = insertHousehold(db));
  ({ accountId } = insertAccount(db, householdId));
  ({ groupId } = insertCategoryGroup(db, householdId, { name: "Living" }));
  ({ categoryId: foodCatId } = insertCategory(db, householdId, groupId, { name: "Food" }));
  ({ categoryId: rentCatId } = insertCategory(db, householdId, groupId, { name: "Rent" }));
  const incGroup = insertCategoryGroup(db, householdId, { name: "Income" });
  ({ categoryId: incomeCatId } = insertCategory(db, householdId, incGroup.groupId, { name: "Salary", isIncome: true }));

  // Food transactions in March
  insertTransaction(db, householdId, accountId, { date: "2026-03-05", normalizedAmount: 5000, amount: -5000, categoryId: foodCatId, name: "Grocery" });
  insertTransaction(db, householdId, accountId, { date: "2026-03-15", normalizedAmount: 3000, amount: -3000, categoryId: foodCatId, name: "Restaurant" });
  // Rent in March
  insertTransaction(db, householdId, accountId, { date: "2026-03-01", normalizedAmount: 100000, amount: -100000, categoryId: rentCatId, name: "Rent" });
  // Income in March (negative normalizedAmount = income)
  insertTransaction(db, householdId, accountId, { date: "2026-03-01", normalizedAmount: -500000, amount: 500000, categoryId: incomeCatId, name: "Salary" });
  // Food in February (prior period)
  insertTransaction(db, householdId, accountId, { date: "2026-02-10", normalizedAmount: 4000, amount: -4000, categoryId: foodCatId, name: "Grocery Feb" });
});

afterEach(() => close());

describe("getSpendingByCategory", () => {
  test("returns correct totals grouped by category", async () => {
    const { getSpendingByCategory } = await import("../../src/queries/reports");
    const result = getSpendingByCategory(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    const food = result.find((r) => r.categoryName === "Food");
    const rent = result.find((r) => r.categoryName === "Rent");
    expect(food?.total).toBe(8000);
    expect(rent?.total).toBe(100000);
    // Income should NOT appear
    const salary = result.find((r) => r.categoryName === "Salary");
    expect(salary).toBeUndefined();
  });

  test("comparison period calculates deltas", async () => {
    const { getSpendingByCategory } = await import("../../src/queries/reports");
    const result = getSpendingByCategory(
      householdId,
      { dateFrom: "2026-03-01", dateTo: "2026-03-31" },
      db,
      { dateFrom: "2026-02-01", dateTo: "2026-02-28" },
    );

    const food = result.find((r) => r.categoryName === "Food");
    expect(food?.total).toBe(8000);
    expect(food?.prevTotal).toBe(4000);
  });
});

describe("getIncomeVsExpense", () => {
  test("uses normalizedAmount sign, handles uncategorized", async () => {
    // Add uncategorized expense
    insertTransaction(db, householdId, accountId, { date: "2026-03-20", normalizedAmount: 2000, amount: -2000, categoryId: null, name: "Unknown" });

    const { getIncomeVsExpense } = await import("../../src/queries/reports");
    const result = getIncomeVsExpense(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    const march = result.find((r) => r.period === "2026-03");
    expect(march).toBeDefined();
    expect(march!.expenses).toBe(110000); // 5000 + 3000 + 100000 + 2000
    expect(march!.income).toBe(500000);
    expect(march!.net).toBe(500000 - 110000);
  });
});

describe("getCategoryTrends", () => {
  test("groups by month and category", async () => {
    const { getCategoryTrends } = await import("../../src/queries/reports");
    const result = getCategoryTrends(householdId, { dateFrom: "2026-02-01", dateTo: "2026-03-31" }, db);

    const foodMarch = result.find((r) => r.period === "2026-03" && r.categoryName === "Food");
    const foodFeb = result.find((r) => r.period === "2026-02" && r.categoryName === "Food");
    expect(foodMarch?.total).toBe(8000);
    expect(foodFeb?.total).toBe(4000);
  });
});

describe("guards", () => {
  test("transfers excluded", async () => {
    insertTransaction(db, householdId, accountId, {
      date: "2026-03-10",
      normalizedAmount: 50000,
      amount: -50000,
      categoryId: foodCatId,
      name: "Transfer",
      isTransfer: true,
    });

    const { getSpendingByCategory } = await import("../../src/queries/reports");
    const result = getSpendingByCategory(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);
    const food = result.find((r) => r.categoryName === "Food");
    expect(food?.total).toBe(8000); // Transfer NOT included
  });

  test("pending transactions excluded", async () => {
    insertTransaction(db, householdId, accountId, {
      date: "2026-03-10",
      normalizedAmount: 9999,
      amount: -9999,
      categoryId: foodCatId,
      name: "Pending",
      pending: true,
    });

    const { getSpendingByCategory } = await import("../../src/queries/reports");
    const result = getSpendingByCategory(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);
    const food = result.find((r) => r.categoryName === "Food");
    expect(food?.total).toBe(8000); // Pending NOT included
  });

  test("account filter narrows results", async () => {
    const { accountId: otherAcctId } = insertAccount(db, householdId, { name: "Savings", type: "savings" });
    insertTransaction(db, householdId, otherAcctId, {
      date: "2026-03-10",
      normalizedAmount: 7000,
      amount: -7000,
      categoryId: foodCatId,
      name: "Other Acct Food",
    });

    const { getSpendingByCategory } = await import("../../src/queries/reports");
    const result = getSpendingByCategory(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31", accountIds: [accountId] }, db);
    const food = result.find((r) => r.categoryName === "Food");
    expect(food?.total).toBe(8000); // Only original account
  });

  test("split transactions attributed to split categories", async () => {
    // Create a split parent
    const { transactionId: splitParentId } = insertTransaction(db, householdId, accountId, {
      date: "2026-03-25",
      normalizedAmount: 10000,
      amount: -10000,
      categoryId: foodCatId,
      name: "Split Purchase",
    });

    insertTransactionSplit(db, splitParentId, foodCatId, 6000);
    insertTransactionSplit(db, splitParentId, rentCatId, 4000);

    const { getSpendingByCategory } = await import("../../src/queries/reports");
    const result = getSpendingByCategory(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    const food = result.find((r) => r.categoryName === "Food");
    const rent = result.find((r) => r.categoryName === "Rent");
    // Food: 5000 + 3000 (non-split) + 6000 (split) = 14000
    expect(food?.total).toBe(14000);
    // Rent: 100000 (non-split) + 4000 (split) = 104000
    expect(rent?.total).toBe(104000);
  });
});
