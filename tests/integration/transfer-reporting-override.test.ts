import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { LedgrDb } from "../../src/db";
import { getCurrentMonth, monthBounds } from "../../src/lib/date-utils";
import {
  insertAccount,
  insertBudget,
  insertBudgetCategory,
  insertCategory,
  insertCategoryGroup,
  insertHousehold,
  insertTransaction,
} from "./helpers";
import { createTestDb } from "./setup";

// Fixtures are derived from the current month: queries compute their own
// windows from `new Date()`, so a hardcoded date would rot.
const month = getCurrentMonth();
const { from: dateFrom, to: dateTo } = monthBounds(month);
const RANGE = { dateFrom, dateTo };
const day = (n: number) => `${month}-${String(n).padStart(2, "0")}`;

/** Plaid convention: a debit has a positive `amount`; normalizedAmount flips it. */
const debit = (cents: number) => ({ amount: cents, normalizedAmount: -cents });
const credit = (cents: number) => ({ amount: -cents, normalizedAmount: cents });

describe("category transfer-as-spending override", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;
  let householdId: string;
  let otherHouseholdId: string;
  let accountId: string;
  let everydayId: string;
  let rentId: string;
  let systemOptInId: string;
  let incomeId: string;
  let otherRentId: string;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    ({ householdId } = await insertHousehold(db, "Primary"));
    ({ householdId: otherHouseholdId } = await insertHousehold(db, "Other"));
    ({ accountId } = await insertAccount(db, householdId));
    const { accountId: otherAccountId } = await insertAccount(db, otherHouseholdId);

    const { groupId } = await insertCategoryGroup(db, householdId, { name: "Expenses" });
    ({ categoryId: everydayId } = await insertCategory(db, householdId, groupId, {
      name: "Everyday",
    }));
    ({ categoryId: rentId } = await insertCategory(db, householdId, groupId, {
      name: "Rent (Zelle)",
      includeTransferInSpending: true,
    }));
    // A system category can never opt in, even if its row is edited by hand.
    ({ categoryId: systemOptInId } = await insertCategory(db, householdId, groupId, {
      name: "System opt-in",
      includeTransferInSpending: true,
      isSystem: true,
    }));
    const { groupId: incomeGroupId } = await insertCategoryGroup(db, householdId, {
      name: "Income",
    });
    ({ categoryId: incomeId } = await insertCategory(db, householdId, incomeGroupId, {
      name: "Pay",
      isIncome: true,
    }));

    // Counted: ordinary spending 1,000.
    await insertTransaction(db, householdId, accountId, {
      date: day(2),
      ...debit(1000),
      categoryId: everydayId,
      name: "Groceries",
    });
    // Counted: opted-in outgoing transfer 5,000.
    await insertTransaction(db, householdId, accountId, {
      date: day(3),
      ...debit(5000),
      categoryId: rentId,
      name: "Zelle to landlord",
      isTransfer: true,
      transferSource: "pattern",
    });
    // Counted: the paired leg that sits in the opted-in category, 4,000.
    await insertTransaction(db, householdId, accountId, {
      date: day(4),
      ...debit(4000),
      categoryId: rentId,
      name: "Zelle to roommate (paired)",
      isTransfer: true,
      transferSource: "auto",
      transferPairId: "paired-leg-elsewhere",
    });
    // Excluded: transfer in a category that did not opt in.
    await insertTransaction(db, householdId, accountId, {
      date: day(5),
      ...debit(2000),
      categoryId: everydayId,
      name: "Move to savings",
      isTransfer: true,
    });
    // Excluded: brokerage activity, even in an opted-in category.
    await insertTransaction(db, householdId, accountId, {
      date: day(6),
      ...debit(7000),
      categoryId: rentId,
      name: "Brokerage buy",
      isTransfer: true,
      transferSource: "investment_account",
    });
    // Excluded: incoming transfer in an opted-in category. It is not spending,
    // and it must not turn into income on the dashboard.
    await insertTransaction(db, householdId, accountId, {
      date: day(7),
      ...credit(3000),
      categoryId: rentId,
      name: "Zelle from roommate",
      isTransfer: true,
    });
    // Excluded: system category with the flag set by hand.
    await insertTransaction(db, householdId, accountId, {
      date: day(8),
      ...debit(6000),
      categoryId: systemOptInId,
      name: "System category transfer",
      isTransfer: true,
    });
    // Income.
    await insertTransaction(db, householdId, accountId, {
      date: day(9),
      ...credit(20000),
      categoryId: incomeId,
      name: "Paycheck",
    });

    // Another household's opted-in category must not leak in either direction.
    const { groupId: otherGroupId } = await insertCategoryGroup(db, otherHouseholdId);
    ({ categoryId: otherRentId } = await insertCategory(db, otherHouseholdId, otherGroupId, {
      name: "Other rent",
      includeTransferInSpending: true,
    }));
    await insertTransaction(db, otherHouseholdId, otherAccountId, {
      date: day(3),
      ...debit(9000),
      categoryId: otherRentId,
      name: "Other household transfer",
      isTransfer: true,
    });
    // A row in this household that points at the other household's category.
    await insertTransaction(db, householdId, accountId, {
      date: day(10),
      ...debit(8000),
      categoryId: otherRentId,
      name: "Cross-household category",
      isTransfer: true,
    });
  });

  afterAll(async () => {
    await close();
  });

  const SPENT = 1000 + 5000 + 4000;

  test("Reports spending counts the opted-in outgoing transfer, nothing else", async () => {
    const { getSpendingByCategory, getCategoryTrends } = await import("../../src/queries/reports");
    const rows = await getSpendingByCategory(householdId, RANGE, db);

    expect(rows.find((r) => r.categoryId === everydayId)?.total).toBe(1000);
    expect(rows.find((r) => r.categoryId === rentId)?.total).toBe(9000);
    expect(rows.find((r) => r.categoryId === systemOptInId)).toBeUndefined();
    expect(rows.find((r) => r.categoryId === otherRentId)).toBeUndefined();
    expect(rows.reduce((t, r) => t + r.total, 0)).toBe(SPENT);

    const trends = await getCategoryTrends(householdId, RANGE, db);
    expect(trends.reduce((t, r) => t + r.total, 0)).toBe(SPENT);
  });

  test("Income vs expense and the Sankey agree with the Spending tab", async () => {
    const { getIncomeVsExpense, getCashFlowSankey } = await import("../../src/queries/reports");

    const [row] = await getIncomeVsExpense(householdId, RANGE, db);
    expect(row).toMatchObject({ income: 20000, expenses: SPENT, net: 20000 - SPENT });

    const { links } = await getCashFlowSankey(householdId, RANGE, db);
    const into = (id: string) =>
      links.filter((l) => l.target === `expense-${id}`).reduce((t, l) => t + l.value, 0);
    expect(into(rentId)).toBe(9000);
    expect(into(everydayId)).toBe(1000);
  });

  test("budgets count the opted-in transfer in its category", async () => {
    const { getBudgetForMonth } = await import("../../src/queries/budgets");
    const { budgetId } = await insertBudget(db, householdId, { month });
    await insertBudgetCategory(db, budgetId, rentId, { limitAmount: 20000 });

    const result = await getBudgetForMonth(householdId, month, db);
    const rent = result.groups.flatMap((g) => g.categories).find((c) => c.categoryId === rentId);
    expect(rent?.spent).toBe(9000);
    expect(result.summary.totalSpent).toBe(SPENT);
  });

  test("dashboard summary and cash-flow chart use the same population", async () => {
    const { getDashboardSummary, getCashFlow } = await import("../../src/queries/dashboard");

    const summary = await getDashboardSummary(householdId, month, db);
    expect(summary.monthlyExpenses).toBe(SPENT);
    // The incoming opted-in transfer is not income.
    expect(summary.monthlyIncome).toBe(20000);

    const flow = await getCashFlow(householdId, 3, db);
    const current = flow.find((r) => r.month === month);
    expect(current).toMatchObject({ income: 20000, expenses: SPENT });
  });

  test("Safe to Spend counts it as discretionary spending", async () => {
    const { getSafeToSpend } = await import("../../src/queries/reports");
    const result = await getSafeToSpend(householdId, db, month);
    expect(result.monthlyIncome).toBe(20000);
    expect(result.discretionarySpent).toBe(SPENT);
  });

  test("Transactions totals and the Expenses filter match", async () => {
    const { getTransactionSummary, getTransactions } = await import(
      "../../src/queries/transactions"
    );
    const filters = { dateFrom, dateTo };

    const summary = await getTransactionSummary(householdId, filters, db);
    expect(summary.totalExpense).toBe(SPENT);
    expect(summary.totalIncome).toBe(20000);

    const page = await getTransactions(
      householdId,
      { ...filters, transactionType: "expense" },
      50,
      null,
      db,
    );
    expect(page.rows.reduce((t, r) => t + Math.abs(r.normalizedAmount), 0)).toBe(SPENT);
  });

  test("drill-down total matches the chart and omits brokerage rows", async () => {
    const { getDrillDownTransactions } = await import("../../src/queries/reports");
    const result = await getDrillDownTransactions(
      householdId,
      { ...RANGE, categoryId: rentId, type: "expense" },
      50,
      db,
    );
    expect(result).toMatchObject({ total: 9000, matchCount: 2 });
    expect(result.rows.every((r) => r.transferSource !== "investment_account")).toBe(true);
  });

  test("the other household's own flag still works for that household", async () => {
    const { getSpendingByCategory } = await import("../../src/queries/reports");
    const rows = await getSpendingByCategory(otherHouseholdId, RANGE, db);
    expect(rows.find((r) => r.categoryId === otherRentId)?.total).toBe(9000);
  });
});
