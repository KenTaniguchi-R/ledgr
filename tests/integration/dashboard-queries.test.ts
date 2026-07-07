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
  getLatestActivityMonth,
} from "../../src/queries/dashboard";

// Month strings derived relative to "now" so tests stay deterministic as the
// calendar moves (see repo convention: never hardcode "recent" dates).
function monthsAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 7);
}
import type { LedgrDb } from "../../src/db";

let db: LedgrDb;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
});

afterEach(async () => {
  await close();
});

describe("getDashboardSummary", () => {
  it("returns correct net worth and monthly figures", async () => {
    const { householdId } = await insertHousehold(db);
    const { accountId: checkingId } = await insertAccount(db, householdId, {
      type: "checking",
      currentBalance: 100000,
    });
    await insertAccount(db, householdId, {
      type: "credit",
      currentBalance: 50000,
    });

    const thisMonth = new Date().toISOString().slice(0, 7);
    await insertTransaction(db, householdId, checkingId, {
      date: `${thisMonth}-05`,
      normalizedAmount: -3000,
      amount: 3000,
    });
    await insertTransaction(db, householdId, checkingId, {
      date: `${thisMonth}-10`,
      normalizedAmount: 200000,
      amount: -200000,
    });
    await insertTransaction(db, householdId, checkingId, {
      date: "2024-01-15",
      normalizedAmount: -5000,
      amount: 5000,
    });

    const result = await getDashboardSummary(householdId, db);

    expect(result.netWorth).toBe(50000);
    expect(result.monthlyExpenses).toBe(3000);
    expect(result.monthlyIncome).toBe(200000);
    expect(result.monthlyNet).toBe(200000 - 3000);
  });
});

describe("getNetWorthHistory", () => {
  it("aggregates balance_history with synthetic today point", async () => {
    const { householdId } = await insertHousehold(db);
    const { accountId: checkingId } = await insertAccount(db, householdId, {
      type: "checking",
      currentBalance: 80000,
    });
    const { accountId: creditId } = await insertAccount(db, householdId, {
      type: "credit",
      currentBalance: 20000,
    });

    // A historical date inside the 3M window but not today: first of last month.
    // Relative to "now" so the test is deterministic whenever the suite runs.
    const histDate = (() => {
      const d = new Date();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() - 1);
      return d.toISOString().slice(0, 10);
    })();

    await db.insert(balanceHistory).values({ id: uuid(), accountId: checkingId, date: histDate, balance: 70000 });
    await db.insert(balanceHistory).values({ id: uuid(), accountId: creditId, date: histDate, balance: 15000 });

    const result = await getNetWorthHistory(householdId, "3M", db);

    expect(result.length).toBeGreaterThanOrEqual(2);

    const historicalPoint = result.find((r) => r.date === histDate);
    expect(historicalPoint).toBeDefined();
    expect(historicalPoint!.assets).toBe(70000);
    expect(historicalPoint!.liabilities).toBe(15000);
    expect(historicalPoint!.netWorth).toBe(55000);

    const today = new Date().toISOString().slice(0, 10);
    const todayPoint = result.find((r) => r.date === today);
    expect(todayPoint).toBeDefined();
    expect(todayPoint!.assets).toBe(80000);
    expect(todayPoint!.liabilities).toBe(20000);
    expect(todayPoint!.netWorth).toBe(60000);
  });

  it("returns empty array when no account has a balance", async () => {
    // The CSV-import scenario: accounts exist but carry no balance, so there is
    // no net worth to plot. The chart must see an empty series to render its
    // empty state instead of a degenerate zero-axis.
    const { householdId } = await insertHousehold(db);
    await insertAccount(db, householdId, { type: "checking", currentBalance: null });

    const result = await getNetWorthHistory(householdId, "6M", db);

    expect(result).toEqual([]);
  });
});

describe("getLatestActivityMonth", () => {
  it("returns the YYYY-MM of the most recent non-pending transaction", async () => {
    const { householdId } = await insertHousehold(db);
    const { accountId } = await insertAccount(db, householdId);

    await insertTransaction(db, householdId, accountId, { date: "2026-03-15" });
    await insertTransaction(db, householdId, accountId, { date: "2026-05-20" });
    // A later, still-pending transaction must not count as activity.
    await insertTransaction(db, householdId, accountId, { date: "2026-06-01", pending: true });

    const result = await getLatestActivityMonth(householdId, db);

    expect(result).toBe("2026-05");
  });

  it("returns null when the household has no transactions", async () => {
    const { householdId } = await insertHousehold(db);
    expect(await getLatestActivityMonth(householdId, db)).toBeNull();
  });
});

describe("getDashboardSummary latest-activity fallback", () => {
  it("uses the latest month with activity when the current month is empty", async () => {
    const { householdId } = await insertHousehold(db);
    const { accountId } = await insertAccount(db, householdId, {
      type: "checking",
      currentBalance: 100000,
    });

    const activityMonth = monthsAgo(2);
    await insertTransaction(db, householdId, accountId, {
      date: `${activityMonth}-05`,
      normalizedAmount: -4000,
      amount: 4000,
    });
    await insertTransaction(db, householdId, accountId, {
      date: `${activityMonth}-10`,
      normalizedAmount: 250000,
      amount: -250000,
    });

    const result = await getDashboardSummary(householdId, db);

    expect(result.monthlyExpenses).toBe(4000);
    expect(result.monthlyIncome).toBe(250000);
    expect(result.monthlyNet).toBe(250000 - 4000);
  });
});

describe("getMonthlySpending", () => {
  it("falls back to the latest month with activity when no month is given", async () => {
    const { householdId } = await insertHousehold(db);
    const { accountId } = await insertAccount(db, householdId);
    const { groupId } = await insertCategoryGroup(db, householdId, { name: "Food" });
    const { categoryId } = await insertCategory(db, householdId, groupId, { name: "Groceries" });

    const activityMonth = monthsAgo(1);
    await insertTransaction(db, householdId, accountId, {
      date: `${activityMonth}-05`,
      normalizedAmount: -6000,
      amount: 6000,
      categoryId,
    });

    const result = await getMonthlySpending(householdId, undefined, db);

    expect(result.length).toBe(1);
    expect(result[0].total).toBe(6000);
  });

  it("groups expense transactions by category", async () => {
    const { householdId } = await insertHousehold(db);
    const { accountId } = await insertAccount(db, householdId);
    const { groupId } = await insertCategoryGroup(db, householdId, { name: "Food" });
    const { categoryId } = await insertCategory(db, householdId, groupId, {
      name: "Groceries",
      icon: "🛒",
    });

    const thisMonth = new Date().toISOString().slice(0, 7);

    await insertTransaction(db, householdId, accountId, {
      date: `${thisMonth}-05`,
      normalizedAmount: -5000,
      amount: 5000,
      categoryId,
    });
    await insertTransaction(db, householdId, accountId, {
      date: `${thisMonth}-10`,
      normalizedAmount: -3000,
      amount: 3000,
      categoryId,
    });
    await insertTransaction(db, householdId, accountId, {
      date: `${thisMonth}-15`,
      normalizedAmount: 10000,
      amount: -10000,
      categoryId,
    });
    await insertTransaction(db, householdId, accountId, {
      date: `${thisMonth}-20`,
      normalizedAmount: -2000,
      amount: 2000,
      categoryId,
      pending: true,
    });

    const result = await getMonthlySpending(householdId, undefined, db);

    expect(result.length).toBe(1);
    expect(result[0].categoryId).toBe(categoryId);
    expect(result[0].categoryName).toBe("Groceries");
    expect(result[0].categoryIcon).toBeNull();
    expect(result[0].groupName).toBe("Food");
    expect(result[0].total).toBe(8000);
  });
});

describe("getCashFlow", () => {
  it("separates income and expenses by month using isIncome category flag", async () => {
    const { householdId } = await insertHousehold(db);
    const { accountId } = await insertAccount(db, householdId);

    const { groupId } = await insertCategoryGroup(db, householdId);
    const { categoryId: incomeCatId } = await insertCategory(db, householdId, groupId, {
      name: "Salary",
      isIncome: true,
    });

    // Current month and previous month both fall inside the getCashFlow(3)
    // window no matter when the suite runs.
    const thisMonth = new Date().toISOString().slice(0, 7);
    const lastMonth = (() => {
      const d = new Date();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() - 1);
      return d.toISOString().slice(0, 7);
    })();

    await insertTransaction(db, householdId, accountId, {
      date: `${thisMonth}-05`,
      normalizedAmount: -4000,
      amount: 4000,
    });
    await insertTransaction(db, householdId, accountId, {
      date: `${thisMonth}-15`,
      normalizedAmount: 150000,
      amount: -150000,
      categoryId: incomeCatId,
    });

    await insertTransaction(db, householdId, accountId, {
      date: `${lastMonth}-10`,
      normalizedAmount: -2500,
      amount: 2500,
    });

    const result = await getCashFlow(householdId, 3, db);

    expect(result.length).toBeGreaterThanOrEqual(2);

    const lastMonthData = result.find((r) => r.month === lastMonth);
    expect(lastMonthData).toBeDefined();
    expect(lastMonthData!.expenses).toBe(2500);
    expect(lastMonthData!.income).toBe(0);
    expect(lastMonthData!.net).toBe(-2500);

    const thisMonthData = result.find((r) => r.month === thisMonth);
    expect(thisMonthData).toBeDefined();
    expect(thisMonthData!.expenses).toBe(4000);
    expect(thisMonthData!.income).toBe(150000);
    expect(thisMonthData!.net).toBe(150000 - 4000);
  });

  it("excludes transfer transactions", async () => {
    const { householdId } = await insertHousehold(db);
    const { accountId } = await insertAccount(db, householdId);

    const thisMonth = new Date().toISOString().slice(0, 7);

    await insertTransaction(db, householdId, accountId, {
      date: `${thisMonth}-05`,
      normalizedAmount: -3000,
      amount: 3000,
    });
    await insertTransaction(db, householdId, accountId, {
      date: `${thisMonth}-10`,
      normalizedAmount: -50000,
      amount: 50000,
      isTransfer: true,
    });

    const result = await getCashFlow(householdId, 3, db);

    const thisMonthData = result.find((r) => r.month === thisMonth);
    expect(thisMonthData).toBeDefined();
    expect(thisMonthData!.expenses).toBe(3000);
  });
});

describe("getRecentTransactions", () => {
  it("returns limited rows with joins", async () => {
    const { householdId } = await insertHousehold(db);
    const { accountId } = await insertAccount(db, householdId, { name: "My Checking" });

    for (let i = 1; i <= 7; i++) {
      await insertTransaction(db, householdId, accountId, {
        date: `2026-05-${String(i).padStart(2, "0")}`,
        name: `Transaction ${i}`,
      });
    }

    const result = await getRecentTransactions(householdId, 5, db);

    expect(result.length).toBe(5);
    expect(result[0].date >= result[1].date).toBe(true);
    expect(result[0].accountName).toBe("My Checking");
    expect(result[0].hasSplits).toBe(false);
  });
});

describe("household isolation", () => {
  it("all queries return empty for wrong household", async () => {
    const { householdId } = await insertHousehold(db);
    const { householdId: otherId } = await insertHousehold(db, "Other Household");
    const { accountId } = await insertAccount(db, householdId, { currentBalance: 50000 });

    const thisMonth = new Date().toISOString().slice(0, 7);
    await insertTransaction(db, householdId, accountId, {
      date: `${thisMonth}-01`,
      normalizedAmount: -1000,
      amount: 1000,
    });

    const summary = await getDashboardSummary(otherId, db);
    expect(summary.netWorth).toBe(0);
    expect(summary.monthlyExpenses).toBe(0);
    expect(summary.monthlyIncome).toBe(0);

    const history = await getNetWorthHistory(otherId, "1M", db);
    const today = new Date().toISOString().slice(0, 10);
    const nonTodayPoints = history.filter((p) => p.date !== today);
    expect(nonTodayPoints.length).toBe(0);

    const spending = await getMonthlySpending(otherId, undefined, db);
    expect(spending.length).toBe(0);

    const cashFlow = await getCashFlow(otherId, 3, db);
    expect(cashFlow.length).toBe(0);

    const recent = await getRecentTransactions(otherId, 5, db);
    expect(recent.length).toBe(0);
  });
});
