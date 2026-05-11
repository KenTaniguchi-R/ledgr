import { centsToDisplay } from "@/lib/money";
import { getCurrentMonth, monthBounds, formatMonthLong, todayDateString } from "@/lib/date-utils";
import { getMonthlySpending, getNetWorthHistory } from "@/queries/dashboard";
import { getTransactions } from "@/queries/transactions";
import { getBudgetForMonth } from "@/queries/budgets";

export async function spendingBreakdownData(householdId: string, month?: string) {
  const targetMonth = month ?? getCurrentMonth();
  const spending = await getMonthlySpending(householdId, targetMonth);
  const totalCents = spending.reduce((s, r) => s + r.total, 0);

  const categories = spending.map((r) => ({
    name: r.categoryName,
    amountCents: r.total,
    amountDisplay: centsToDisplay(r.total),
    percentage: totalCents > 0 ? Math.round((r.total / totalCents) * 100) : 0,
  }));

  return {
    data: {
      categories,
      period: formatMonthLong(targetMonth),
      totalDisplay: centsToDisplay(totalCents),
    },
    summary: { categories, period: formatMonthLong(targetMonth), totalDisplay: centsToDisplay(totalCents) },
  };
}

export async function transactionTableData(householdId: string, limit?: number) {
  const txnLimit = limit ?? 25;
  const page = await getTransactions(householdId, {}, txnLimit);

  const txnRows = page.rows.map((r) => ({
    date: r.date,
    name: r.name,
    merchant: r.merchantName,
    category: r.categoryName,
    amountCents: Math.abs(r.normalizedAmount),
    amountDisplay: centsToDisplay(Math.abs(r.normalizedAmount)),
    isIncome: r.normalizedAmount > 0,
  }));

  return {
    data: {
      transactions: txnRows,
      totalCount: txnRows.length + (page.nextCursor ? 1 : 0),
      page: 1,
    },
    summary: { transactionCount: txnRows.length, hasMore: !!page.nextCursor },
  };
}

export async function budgetProgressData(householdId: string, month?: string) {
  const targetMonth = month ?? getCurrentMonth();
  const budget = await getBudgetForMonth(householdId, targetMonth);

  const allCategories = budget.groups.flatMap((g) =>
    g.categories.map((c) => ({
      name: c.categoryName,
      allocatedCents: c.limitAmount,
      spentCents: c.spent,
      allocatedDisplay: centsToDisplay(c.limitAmount),
      spentDisplay: centsToDisplay(c.spent),
      percentUsed: c.limitAmount > 0 ? Math.round((c.spent / c.limitAmount) * 100) : 0,
    })),
  );

  const { to: lastDay } = monthBounds(targetMonth);
  const today = todayDateString();
  const endDate = new Date(lastDay + "T23:59:59");
  const todayDate = new Date(today + "T00:00:00");
  const daysRemaining = Math.max(
    0,
    Math.ceil((endDate.getTime() - todayDate.getTime()) / 86400000),
  );

  return {
    data: {
      month: formatMonthLong(targetMonth),
      categories: allCategories,
      totalAllocatedDisplay: centsToDisplay(budget.summary.totalBudgeted),
      totalSpentDisplay: centsToDisplay(budget.summary.totalSpent),
      daysRemaining,
    },
    summary: {
      month: targetMonth,
      totalBudgeted: centsToDisplay(budget.summary.totalBudgeted),
      totalSpent: centsToDisplay(budget.summary.totalSpent),
      remaining: centsToDisplay(budget.summary.totalRemaining),
      categoryCount: allCategories.length,
      daysRemaining,
    },
  };
}

type NetWorthRange = "1M" | "3M" | "6M" | "1Y" | "all";

export async function netWorthTrendData(householdId: string, range?: NetWorthRange) {
  const timeRange = range ?? "6M";
  const points = await getNetWorthHistory(householdId, timeRange);

  const formattedPoints = points.map((p) => ({
    date: p.date,
    assetsCents: p.assets,
    liabilitiesCents: p.liabilities,
    netWorthCents: p.netWorth,
    assetsDisplay: centsToDisplay(p.assets),
    liabilitiesDisplay: centsToDisplay(p.liabilities),
    netWorthDisplay: centsToDisplay(p.netWorth),
  }));

  const current = points.length > 0 ? points[points.length - 1] : null;
  const first = points.length > 0 ? points[0] : null;
  const changeCents = current && first ? current.netWorth - first.netWorth : 0;
  const changePercent =
    first && first.netWorth !== 0
      ? (changeCents / Math.abs(first.netWorth)) * 100
      : 0;

  return {
    data: {
      points: formattedPoints,
      currentNetWorthDisplay: current ? centsToDisplay(current.netWorth) : "$0.00",
      changeDisplay: centsToDisplay(changeCents),
      changePercent,
    },
    summary: {
      currentNetWorth: current ? centsToDisplay(current.netWorth) : "$0.00",
      change: centsToDisplay(changeCents),
      changePercent: `${changePercent.toFixed(1)}%`,
      dataPoints: formattedPoints.length,
      range: timeRange,
    },
  };
}
