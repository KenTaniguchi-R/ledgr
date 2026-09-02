import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertCategoryGroup,
  insertCategory,
} from "./helpers";
import { insertTransaction } from "./helpers";
import type { LedgrDb } from "../../src/db";

/**
 * Every Reports tab answers "how much did I spend?" from its own query. They
 * are only trustworthy if they agree, so these tests pin the definition of
 * spending itself rather than any one tab's arithmetic.
 *
 * The canonical rule lives in `spendingBaseConditions`: a negative, settled,
 * non-transfer, non-income transaction, summed by magnitude.
 */

let db: LedgrDb;
let close: () => Promise<void>;
let householdId: string;
let accountId: string;
let foodCatId: string;
let rentCatId: string;
let incomeCatId: string;

const RANGE = { dateFrom: "2026-03-01", dateTo: "2026-03-31" };

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  ({ householdId } = await insertHousehold(db));
  ({ accountId } = await insertAccount(db, householdId));

  const { groupId } = await insertCategoryGroup(db, householdId, { name: "Living" });
  ({ categoryId: foodCatId } = await insertCategory(db, householdId, groupId, { name: "Food" }));
  ({ categoryId: rentCatId } = await insertCategory(db, householdId, groupId, { name: "Rent" }));
  const incGroup = await insertCategoryGroup(db, householdId, { name: "Income" });
  ({ categoryId: incomeCatId } = await insertCategory(db, householdId, incGroup.groupId, {
    name: "Salary",
    isIncome: true,
  }));

  // Food: 8000 of charges against a 2000 refund.
  await insertTransaction(db, householdId, accountId, { date: "2026-03-05", normalizedAmount: -5000, amount: 5000, categoryId: foodCatId, name: "Grocery" });
  await insertTransaction(db, householdId, accountId, { date: "2026-03-15", normalizedAmount: -3000, amount: 3000, categoryId: foodCatId, name: "Restaurant" });
  await insertTransaction(db, householdId, accountId, { date: "2026-03-20", normalizedAmount: 2000, amount: -2000, categoryId: foodCatId, name: "Grocery refund" });

  // Rent carries only a credit this period — it nets positive, so it is not
  // spending at all. This is the shape that made $2,600 of rent vanish from
  // the Spending tab while Income vs Expense counted it as an expense.
  await insertTransaction(db, householdId, accountId, { date: "2026-03-02", normalizedAmount: 250000, amount: -250000, categoryId: rentCatId, name: "Rent credit" });

  // Uncategorized spending — the single largest line in most real households.
  await insertTransaction(db, householdId, accountId, { date: "2026-03-08", normalizedAmount: -7000, amount: 7000, categoryId: null, name: "Unknown merchant" });

  await insertTransaction(db, householdId, accountId, { date: "2026-03-01", normalizedAmount: 500000, amount: -500000, categoryId: incomeCatId, name: "Salary" });
});

afterEach(async () => {
  await close();
});

/** Food 8000 + uncategorized 7000. Rent and the refund are not spending. */
const EXPECTED_SPENDING = 15000;

describe("spending is defined once across every Reports tab", () => {
  test("the Spending tab totals only negative, non-income transactions", async () => {
    const { getSpendingByCategory } = await import("../../src/queries/reports");
    const rows = await getSpendingByCategory(householdId, RANGE, db);

    expect(rows.reduce((s, r) => s + r.total, 0)).toBe(EXPECTED_SPENDING);
    expect(rows.find((r) => r.categoryName === "Rent")).toBeUndefined();
  });

  test("Income vs Expense reports the same total as the Spending tab", async () => {
    const { getIncomeVsExpense } = await import("../../src/queries/reports");
    const rows = await getIncomeVsExpense(householdId, RANGE, db);

    expect(rows.reduce((s, r) => s + r.expenses, 0)).toBe(EXPECTED_SPENDING);
  });

  test("a refund is not counted as spending", async () => {
    const { getIncomeVsExpense, getIncomeExpenseByCategory } = await import("../../src/queries/reports");

    const totals = await getIncomeVsExpense(householdId, RANGE, db);
    const byCategory = await getIncomeExpenseByCategory(householdId, RANGE, db);
    const food = byCategory.find((r) => r.categoryName === "Food");

    // 8000 of charges, not 8000 + 2000 of absolute movement.
    expect(food?.total).toBe(8000);
    expect(totals.reduce((s, r) => s + r.expenses, 0)).toBe(EXPECTED_SPENDING);
  });

  test("a category that only received credits is not an expense category", async () => {
    const { getIncomeExpenseByCategory } = await import("../../src/queries/reports");
    const rows = await getIncomeExpenseByCategory(householdId, RANGE, db);

    expect(rows.find((r) => r.categoryName === "Rent")).toBeUndefined();
  });

  test("Trends counts the same spending as the Spending tab", async () => {
    const { getCategoryTrends } = await import("../../src/queries/reports");
    const rows = await getCategoryTrends(householdId, RANGE, db);

    expect(rows.reduce((s, r) => s + r.total, 0)).toBe(EXPECTED_SPENDING);
  });
});

describe("uncategorized spending is never silently dropped", () => {
  test("it appears in the Income vs Expense breakdown", async () => {
    const { getIncomeExpenseByCategory } = await import("../../src/queries/reports");
    const rows = await getIncomeExpenseByCategory(householdId, RANGE, db);

    const uncategorized = rows.find((r) => r.categoryId === null);
    expect(uncategorized?.total).toBe(7000);
    expect(uncategorized?.isIncome).toBe(false);
  });

  test("it appears in Trends", async () => {
    const { getCategoryTrends } = await import("../../src/queries/reports");
    const rows = await getCategoryTrends(householdId, RANGE, db);

    expect(rows.find((r) => r.categoryId === null)?.total).toBe(7000);
  });

  test("it is a node in the cash-flow Sankey", async () => {
    const { getCashFlowSankey } = await import("../../src/queries/reports");
    const { nodes } = await getCashFlowSankey(householdId, RANGE, db);

    // A money-flow diagram that omits the largest outflow is not a money-flow
    // diagram. Rent, which only received a credit, is correctly absent.
    expect(nodes.find((n) => n.id === "expense-uncategorized")?.name).toBe("Uncategorized");
    expect(nodes.find((n) => n.name === "Rent")).toBeUndefined();
  });

  test("the expense rows sum to the Total Expenses tile", async () => {
    const { getIncomeVsExpense, getIncomeExpenseByCategory } = await import("../../src/queries/reports");

    const tile = (await getIncomeVsExpense(householdId, RANGE, db)).reduce((s, r) => s + r.expenses, 0);
    const rows = (await getIncomeExpenseByCategory(householdId, RANGE, db))
      .filter((r) => !r.isIncome)
      .reduce((s, r) => s + r.total, 0);

    expect(rows).toBe(tile);
  });
});

describe("the Income vs Expense category table reads correctly", () => {
  test("expenses are positive magnitudes, largest first", async () => {
    const { getIncomeExpenseByCategory } = await import("../../src/queries/reports");
    const expenses = (await getIncomeExpenseByCategory(householdId, RANGE, db)).filter((r) => !r.isIncome);

    expect(expenses.every((r) => r.total > 0)).toBe(true);
    expect(expenses.map((r) => r.total)).toEqual([8000, 7000]);
  });

  test("percentages are positive and sum to 100 within each pool", async () => {
    const { getIncomeExpenseByCategory } = await import("../../src/queries/reports");
    const rows = await getIncomeExpenseByCategory(householdId, RANGE, db);
    const expenses = rows.filter((r) => !r.isIncome);

    expect(expenses.every((r) => r.percentOfTotal > 0)).toBe(true);
    expect(expenses.reduce((s, r) => s + r.percentOfTotal, 0)).toBeCloseTo(100, 5);
    expect(rows.filter((r) => r.isIncome).reduce((s, r) => s + r.percentOfTotal, 0)).toBeCloseTo(100, 5);
  });
});
