import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertTransaction,
  insertTransactionSplit,
  insertCategoryGroup,
  insertCategory,
  insertBudget,
  insertBudgetCategory,
} from "./helpers";
import { getBudgetForMonth } from "../../src/queries/budgets";
import type { LedgrDb } from "../../src/db";

describe("getBudgetForMonth", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;
  let householdId: string;
  let accountId: string;
  let foodGroupId: string;
  let incomeGroupId: string;
  let groceriesCatId: string;
  let diningCatId: string;
  let salaryCatId: string;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());

    ({ householdId } = await insertHousehold(db));
    ({ accountId } = await insertAccount(db, householdId));
    ({ groupId: foodGroupId } = await insertCategoryGroup(db, householdId, { name: "Food & Drink" }));
    ({ groupId: incomeGroupId } = await insertCategoryGroup(db, householdId, { name: "Income" }));
    ({ categoryId: groceriesCatId } = await insertCategory(db, householdId, foodGroupId, { name: "Groceries" }));
    ({ categoryId: diningCatId } = await insertCategory(db, householdId, foodGroupId, { name: "Dining" }));
    ({ categoryId: salaryCatId } = await insertCategory(db, householdId, incomeGroupId, { name: "Salary", isIncome: true }));
  });

  afterAll(async () => {
    await close();
  });

  it("returns null budget for month with no budget", async () => {
    const result = await getBudgetForMonth(householdId, "2026-01", db);
    expect(result.budget).toBeNull();
    expect(result.groups).toHaveLength(0);
  });

  it("returns budgeted categories with correct spent aggregation", async () => {
    const month = "2026-02";
    const { budgetId } = await insertBudget(db, householdId, { month });
    await insertBudgetCategory(db, budgetId, groceriesCatId, { limitAmount: 20000 });

    await insertTransaction(db, householdId, accountId, {
      date: "2026-02-05",
      name: "Whole Foods",
      amount: 3500,
      normalizedAmount: -3500,
      categoryId: groceriesCatId,
    });
    await insertTransaction(db, householdId, accountId, {
      date: "2026-02-15",
      name: "Trader Joes",
      amount: 1500,
      normalizedAmount: -1500,
      categoryId: groceriesCatId,
    });

    const result = await getBudgetForMonth(householdId, month, db);

    expect(result.budget).not.toBeNull();
    expect(result.budget!.month).toBe(month);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].groupName).toBe("Food & Drink");
    expect(result.groups[0].categories).toHaveLength(1);

    const grocRow = result.groups[0].categories[0];
    expect(grocRow.categoryName).toBe("Groceries");
    expect(grocRow.limitAmount).toBe(20000);
    expect(grocRow.spent).toBe(5000);
    expect(grocRow.remaining).toBe(15000);
  });

  it("handles transaction splits — sums split amounts instead of parent", async () => {
    const month = "2026-03";
    const { budgetId } = await insertBudget(db, householdId, { month });
    await insertBudgetCategory(db, budgetId, groceriesCatId, { limitAmount: 15000 });
    await insertBudgetCategory(db, budgetId, diningCatId, { limitAmount: 10000 });

    const { transactionId } = await insertTransaction(db, householdId, accountId, {
      date: "2026-03-10",
      name: "Costco Run",
      amount: 5000,
      normalizedAmount: -5000,
      categoryId: groceriesCatId,
    });
    await insertTransactionSplit(db, transactionId, groceriesCatId, 3000);
    await insertTransactionSplit(db, transactionId, diningCatId, 2000);

    const result = await getBudgetForMonth(householdId, month, db);

    const grocRow = result.groups[0].categories.find((c) => c.categoryName === "Groceries");
    const diningRow = result.groups[0].categories.find((c) => c.categoryName === "Dining");

    expect(grocRow!.spent).toBe(3000);
    expect(diningRow!.spent).toBe(2000);
  });

  it("excludes transfers, pending, and soft-deleted transactions", async () => {
    const month = "2026-04";
    const { budgetId } = await insertBudget(db, householdId, { month });
    await insertBudgetCategory(db, budgetId, groceriesCatId, { limitAmount: 10000 });

    await insertTransaction(db, householdId, accountId, {
      date: "2026-04-01",
      name: "Transfer Out",
      amount: 2000,
      normalizedAmount: -2000,
      categoryId: groceriesCatId,
      isTransfer: true,
    });

    await insertTransaction(db, householdId, accountId, {
      date: "2026-04-02",
      name: "Pending Charge",
      amount: 1000,
      normalizedAmount: -1000,
      categoryId: groceriesCatId,
      pending: true,
    });

    await insertTransaction(db, householdId, accountId, {
      date: "2026-04-03",
      name: "Deleted Txn",
      amount: 500,
      normalizedAmount: -500,
      categoryId: groceriesCatId,
      deletedAt: new Date(),
    });

    await insertTransaction(db, householdId, accountId, {
      date: "2026-04-04",
      name: "Valid Expense",
      amount: 800,
      normalizedAmount: -800,
      categoryId: groceriesCatId,
    });

    const result = await getBudgetForMonth(householdId, month, db);
    const grocRow = result.groups[0].categories[0];
    expect(grocRow.spent).toBe(800);
  });

  it("excludes income (positive normalizedAmount)", async () => {
    const month = "2026-05";
    const { budgetId } = await insertBudget(db, householdId, { month });
    await insertBudgetCategory(db, budgetId, salaryCatId, { limitAmount: 0 });

    await insertTransaction(db, householdId, accountId, {
      date: "2026-05-01",
      name: "Paycheck",
      amount: -500000,
      normalizedAmount: 500000,
      categoryId: salaryCatId,
    });

    const result = await getBudgetForMonth(householdId, month, db);
    const salaryRow = result.groups[0].categories.find((c) => c.categoryName === "Salary");
    expect(salaryRow!.spent).toBe(0);
  });

  it("reports unbudgeted spending for categories not in budget", async () => {
    const month = "2026-06";
    const { budgetId } = await insertBudget(db, householdId, { month });
    await insertBudgetCategory(db, budgetId, groceriesCatId, { limitAmount: 10000 });

    await insertTransaction(db, householdId, accountId, {
      date: "2026-06-05",
      name: "Restaurant",
      amount: 3000,
      normalizedAmount: -3000,
      categoryId: diningCatId,
    });

    await insertTransaction(db, householdId, accountId, {
      date: "2026-06-10",
      name: "Mystery Charge",
      amount: 1200,
      normalizedAmount: -1200,
      categoryId: null,
    });

    const result = await getBudgetForMonth(householdId, month, db);
    expect(result.unbudgeted.spent).toBe(4200);
    expect(result.unbudgeted.categories).toHaveLength(2);

    const diningUnbudgeted = result.unbudgeted.categories.find((c) => c.categoryName === "Dining");
    expect(diningUnbudgeted).toBeDefined();
    expect(diningUnbudgeted!.spent).toBe(3000);

    const uncategorized = result.unbudgeted.categories.find((c) => c.categoryName === "Uncategorized");
    expect(uncategorized).toBeDefined();
    expect(uncategorized!.spent).toBe(1200);
  });
});
