import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { v4 as uuid } from "uuid";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertTransaction,
  insertCategoryGroup,
  insertCategory,
} from "./helpers";
import { balanceHistory } from "../../src/db/schema";
import {
  getDashboardSummary,
  getNetWorthHistory,
  getMonthlySpending,
  getCashFlow,
  getRecentTransactions,
} from "../../src/queries/dashboard";

type TestDb = ReturnType<typeof createTestDb>;

let testDb: TestDb;

beforeEach(() => {
  testDb = createTestDb();
});

afterEach(() => {
  testDb.close();
});

describe("getDashboardSummary", () => {
  it("returns correct net worth and monthly figures", () => {
    const { db } = testDb;
    const { householdId } = insertHousehold(db);
    const { accountId: checkingId } = insertAccount(db, householdId, {
      type: "checking",
      currentBalance: 100000, // $1000
    });
    insertAccount(db, householdId, {
      type: "credit",
      currentBalance: 50000, // $500
    });

    const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    // Expense: normalizedAmount < 0
    insertTransaction(db, householdId, checkingId, {
      date: `${thisMonth}-05`,
      normalizedAmount: -3000, // $30 expense
      amount: 3000,
    });
    // Income: normalizedAmount > 0
    insertTransaction(db, householdId, checkingId, {
      date: `${thisMonth}-10`,
      normalizedAmount: 200000, // $2000 income
      amount: -200000,
    });
    // Last month's transaction — should not be included
    insertTransaction(db, householdId, checkingId, {
      date: "2024-01-15",
      normalizedAmount: -5000,
      amount: 5000,
    });

    const result = getDashboardSummary(householdId, db);

    // netWorth = assets - liabilities = 100000 - 50000 = 50000
    expect(result.netWorth).toBe(50000);
    expect(result.monthlyExpenses).toBe(3000);
    expect(result.monthlyIncome).toBe(200000);
    expect(result.monthlyNet).toBe(200000 - 3000);
  });
});

describe("getNetWorthHistory", () => {
  it("aggregates balance_history with synthetic today point", () => {
    const { db } = testDb;
    const { householdId } = insertHousehold(db);
    const { accountId: checkingId } = insertAccount(db, householdId, {
      type: "checking",
      currentBalance: 80000,
    });
    const { accountId: creditId } = insertAccount(db, householdId, {
      type: "credit",
      currentBalance: 20000,
    });

    // Insert historical balance snapshots
    db.insert(balanceHistory)
      .values({ id: uuid(), accountId: checkingId, date: "2026-04-01", balance: 70000 })
      .run();
    db.insert(balanceHistory)
      .values({ id: uuid(), accountId: creditId, date: "2026-04-01", balance: 15000 })
      .run();

    const result = getNetWorthHistory(householdId, "3M", db);

    // Should have at least 2 points: historical + today
    expect(result.length).toBeGreaterThanOrEqual(2);

    // Check historical point
    const historicalPoint = result.find((r) => r.date === "2026-04-01");
    expect(historicalPoint).toBeDefined();
    expect(historicalPoint!.assets).toBe(70000);
    expect(historicalPoint!.liabilities).toBe(15000);
    expect(historicalPoint!.netWorth).toBe(55000);

    // Check today's synthetic point
    const today = new Date().toISOString().slice(0, 10);
    const todayPoint = result.find((r) => r.date === today);
    expect(todayPoint).toBeDefined();
    expect(todayPoint!.assets).toBe(80000);
    expect(todayPoint!.liabilities).toBe(20000);
    expect(todayPoint!.netWorth).toBe(60000);
  });
});

describe("getMonthlySpending", () => {
  it("groups expense transactions by category", () => {
    const { db } = testDb;
    const { householdId } = insertHousehold(db);
    const { accountId } = insertAccount(db, householdId);
    const { groupId } = insertCategoryGroup(db, householdId, { name: "Food" });
    const { categoryId } = insertCategory(db, householdId, groupId, {
      name: "Groceries",
      icon: "🛒",
    });

    const thisMonth = new Date().toISOString().slice(0, 7);

    // Expense with category (negative normalizedAmount)
    insertTransaction(db, householdId, accountId, {
      date: `${thisMonth}-05`,
      normalizedAmount: -5000,
      amount: 5000,
      categoryId,
    });
    insertTransaction(db, householdId, accountId, {
      date: `${thisMonth}-10`,
      normalizedAmount: -3000,
      amount: 3000,
      categoryId,
    });
    // Income (positive normalizedAmount) — should be excluded
    insertTransaction(db, householdId, accountId, {
      date: `${thisMonth}-15`,
      normalizedAmount: 10000,
      amount: -10000,
      categoryId,
    });
    // Pending transaction — should be excluded
    insertTransaction(db, householdId, accountId, {
      date: `${thisMonth}-20`,
      normalizedAmount: -2000,
      amount: 2000,
      categoryId,
      pending: true,
    });

    const result = getMonthlySpending(householdId, undefined, db);

    expect(result.length).toBe(1);
    expect(result[0].categoryId).toBe(categoryId);
    expect(result[0].categoryName).toBe("Groceries");
    expect(result[0].categoryIcon).toBe("🛒");
    expect(result[0].groupName).toBe("Food");
    expect(result[0].total).toBe(8000);
  });
});

describe("getCashFlow", () => {
  it("separates income and expenses by month using isIncome category flag", () => {
    const { db } = testDb;
    const { householdId } = insertHousehold(db);
    const { accountId } = insertAccount(db, householdId);

    // Set up an income category (isIncome = true)
    const { groupId } = insertCategoryGroup(db, householdId);
    const { categoryId: incomeCatId } = insertCategory(db, householdId, groupId, {
      name: "Salary",
      isIncome: true,
    });

    // May expense (no income category — positive normalizedAmount = expense)
    insertTransaction(db, householdId, accountId, {
      date: "2026-05-05",
      normalizedAmount: 4000, // expense
      amount: -4000,
    });
    // May income (categorized with isIncome category)
    insertTransaction(db, householdId, accountId, {
      date: "2026-05-15",
      normalizedAmount: -150000, // income (negative normalizedAmount in Plaid convention)
      amount: 150000,
      categoryId: incomeCatId,
    });

    // April expense
    insertTransaction(db, householdId, accountId, {
      date: "2026-04-10",
      normalizedAmount: 2500, // expense
      amount: -2500,
    });

    const result = getCashFlow(householdId, 3, db);

    expect(result.length).toBeGreaterThanOrEqual(2);

    const aprilData = result.find((r) => r.month === "2026-04");
    expect(aprilData).toBeDefined();
    expect(aprilData!.expenses).toBe(2500);
    expect(aprilData!.income).toBe(0);
    expect(aprilData!.net).toBe(-2500);

    const mayData = result.find((r) => r.month === "2026-05");
    expect(mayData).toBeDefined();
    expect(mayData!.expenses).toBe(4000);
    expect(mayData!.income).toBe(150000);
    expect(mayData!.net).toBe(150000 - 4000);
  });

  it("excludes transfer transactions", () => {
    const { db } = testDb;
    const { householdId } = insertHousehold(db);
    const { accountId } = insertAccount(db, householdId);

    // Normal expense
    insertTransaction(db, householdId, accountId, {
      date: "2026-05-05",
      normalizedAmount: 3000,
      amount: -3000,
    });
    // Transfer — should be excluded
    insertTransaction(db, householdId, accountId, {
      date: "2026-05-10",
      normalizedAmount: 50000,
      amount: -50000,
      isTransfer: true,
    });

    const result = getCashFlow(householdId, 3, db);

    const mayData = result.find((r) => r.month === "2026-05");
    expect(mayData).toBeDefined();
    expect(mayData!.expenses).toBe(3000); // only the non-transfer expense
  });
});

describe("getRecentTransactions", () => {
  it("returns limited rows with joins", () => {
    const { db } = testDb;
    const { householdId } = insertHousehold(db);
    const { accountId } = insertAccount(db, householdId, { name: "My Checking" });

    // Insert 7 transactions
    for (let i = 1; i <= 7; i++) {
      insertTransaction(db, householdId, accountId, {
        date: `2026-05-${String(i).padStart(2, "0")}`,
        name: `Transaction ${i}`,
      });
    }

    const result = getRecentTransactions(householdId, 5, db);

    expect(result.length).toBe(5);
    // Should be ordered desc by date
    expect(result[0].date >= result[1].date).toBe(true);
    // Should include account name
    expect(result[0].accountName).toBe("My Checking");
    // hasSplits should be false
    expect(result[0].hasSplits).toBe(false);
  });
});

describe("household isolation", () => {
  it("all queries return empty for wrong household", () => {
    const { db } = testDb;
    const { householdId } = insertHousehold(db);
    const { householdId: otherId } = insertHousehold(db, "Other Household");
    const { accountId } = insertAccount(db, householdId, { currentBalance: 50000 });

    const thisMonth = new Date().toISOString().slice(0, 7);
    insertTransaction(db, householdId, accountId, {
      date: `${thisMonth}-01`,
      normalizedAmount: -1000,
      amount: 1000,
    });

    // Query with wrong household
    const summary = getDashboardSummary(otherId, db);
    expect(summary.netWorth).toBe(0);
    expect(summary.monthlyExpenses).toBe(0);
    expect(summary.monthlyIncome).toBe(0);

    const history = getNetWorthHistory(otherId, "1M", db);
    const today = new Date().toISOString().slice(0, 10);
    // Only today's synthetic point (with 0 values)
    const nonTodayPoints = history.filter((p) => p.date !== today);
    expect(nonTodayPoints.length).toBe(0);

    const spending = getMonthlySpending(otherId, undefined, db);
    expect(spending.length).toBe(0);

    const cashFlow = getCashFlow(otherId, 3, db);
    expect(cashFlow.length).toBe(0);

    const recent = getRecentTransactions(otherId, 5, db);
    expect(recent.length).toBe(0);
  });
});
