import { eq, gte, lte, sql, and, inArray, notInArray, isNull } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  transactions,
  transactionSplits,
  categories,
  accounts,
  balanceHistory,
} from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted, getIncomeCategoryIds } from "@/lib/query-helpers";
import { classifyAccountType } from "@/lib/account-utils";
import {
  spendingBaseConditions,
  findSplitParentIds,
  aggregateSpending,
  enrichSpendingMap,
} from "@/lib/spending-helpers";

export interface ReportFilters {
  dateFrom: string;
  dateTo: string;
  accountIds?: string[];
  categoryIds?: string[];
}

export interface SpendingRow {
  categoryId: string | null;
  categoryName: string;
  groupName: string | null;
  groupId: string | null;
  total: number;
  prevTotal: number;
}

export interface IncomeExpenseRow {
  period: string;
  income: number;
  expenses: number;
  net: number;
}

export interface CategoryTrendRow {
  period: string;
  categoryId: string;
  categoryName: string;
  total: number;
}

// ── Public query functions ──────────────────────────────────────────

export function getSpendingByCategory(
  householdId: string,
  filters: ReportFilters,
  db: LedgrDb = defaultDb,
  comparisonPeriod?: { dateFrom: string; dateTo: string },
): SpendingRow[] {
  const currentSpending = aggregateSpending(householdId, filters, db);
  const enriched = enrichSpendingMap(currentSpending, db);

  let prevMap = new Map<string, number>();
  if (comparisonPeriod) {
    prevMap = aggregateSpending(householdId, { ...filters, ...comparisonPeriod }, db);
  }

  return enriched.map((row) => ({
    categoryId: row.id,
    categoryName: row.name,
    groupName: row.groupName,
    groupId: row.groupId,
    total: row.value,
    prevTotal: prevMap.get(row.id ?? "uncategorized") ?? 0,
  }));
}

export function getIncomeVsExpense(
  householdId: string,
  filters: ReportFilters,
  db: LedgrDb = defaultDb,
): IncomeExpenseRow[] {
  const scoped = scopedQuery(householdId, db);

  const conditions = [
    notDeleted(transactions),
    eq(transactions.pending, false),
    eq(transactions.isTransfer, false),
    isNull(transactions.transferPairId),
    gte(transactions.date, filters.dateFrom),
    lte(transactions.date, filters.dateTo),
  ];

  if (filters.accountIds?.length) {
    conditions.push(inArray(transactions.accountId, filters.accountIds));
  }

  const txns = db
    .select({
      date: transactions.date,
      normalizedAmount: transactions.normalizedAmount,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(scoped.where(transactions, ...conditions))
    .all();

  const incomeCatIds = getIncomeCategoryIds(db);

  const byMonth = new Map<string, { income: number; expenses: number }>();
  for (const txn of txns) {
    const month = txn.date.slice(0, 7);
    if (!byMonth.has(month)) {
      byMonth.set(month, { income: 0, expenses: 0 });
    }
    const entry = byMonth.get(month)!;
    if (txn.categoryId && incomeCatIds.has(txn.categoryId)) {
      entry.income += txn.normalizedAmount;
    } else {
      entry.expenses += Math.abs(txn.normalizedAmount);
    }
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, { income, expenses }]) => ({
      period,
      income,
      expenses,
      net: income - expenses,
    }));
}

export function getCategoryTrends(
  householdId: string,
  filters: ReportFilters,
  db: LedgrDb = defaultDb,
): CategoryTrendRow[] {
  const scoped = scopedQuery(householdId, db);
  const conditions = spendingBaseConditions(filters, db);

  if (filters.categoryIds?.length) {
    conditions.push(inArray(transactions.categoryId, filters.categoryIds));
  }

  const splitParentIds = findSplitParentIds(scoped, conditions, db);

  // Non-split: group by month + category
  const nonSplitConditions =
    splitParentIds.length > 0
      ? [...conditions, notInArray(transactions.id, splitParentIds)]
      : conditions;

  const nonSplitRows = db
    .select({
      month: sql<string>`substr(${transactions.date}, 1, 7)`,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      total: sql<number>`COALESCE(SUM(ABS(${transactions.normalizedAmount})), 0)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(scoped.where(transactions, ...nonSplitConditions))
    .groupBy(sql`substr(${transactions.date}, 1, 7)`, transactions.categoryId)
    .all();

  const trendMap = new Map<string, number>(); // "YYYY-MM|catId" -> total

  for (const row of nonSplitRows) {
    if (!row.categoryId) continue;
    const key = `${row.month}|${row.categoryId}`;
    trendMap.set(key, (trendMap.get(key) ?? 0) + row.total);
  }

  // Split transactions: need date from parent
  if (splitParentIds.length > 0) {
    const parentDates = db
      .select({ id: transactions.id, date: transactions.date })
      .from(transactions)
      .where(inArray(transactions.id, splitParentIds))
      .all();

    const dateMap = new Map(parentDates.map((p) => [p.id, p.date.slice(0, 7)]));

    const splitRows = db
      .select({
        transactionId: transactionSplits.transactionId,
        categoryId: transactionSplits.categoryId,
        amount: transactionSplits.amount,
      })
      .from(transactionSplits)
      .where(inArray(transactionSplits.transactionId, splitParentIds))
      .all();

    for (const row of splitRows) {
      const month = dateMap.get(row.transactionId);
      if (!month) continue;
      if (filters.categoryIds?.length && !filters.categoryIds.includes(row.categoryId)) continue;
      const key = `${month}|${row.categoryId}`;
      trendMap.set(key, (trendMap.get(key) ?? 0) + row.amount);
    }
  }

  // Resolve category names
  const allCatIds = [...new Set([...trendMap.keys()].map((k) => k.split("|")[1]))];
  const catNames = new Map<string, string>();
  if (allCatIds.length > 0) {
    const cats = db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(inArray(categories.id, allCatIds))
      .all();
    for (const c of cats) catNames.set(c.id, c.name);
  }

  const result: CategoryTrendRow[] = [];
  for (const [key, total] of trendMap.entries()) {
    const [period, categoryId] = key.split("|");
    result.push({
      period,
      categoryId,
      categoryName: catNames.get(categoryId) ?? "Unknown",
      total,
    });
  }

  return result.sort((a, b) => a.period.localeCompare(b.period) || b.total - a.total);
}

export function getReportNetWorthHistory(
  householdId: string,
  filters: ReportFilters,
  db: LedgrDb = defaultDb,
): { date: string; assets: number; liabilities: number; netWorth: number }[] {
  const scoped = scopedQuery(householdId, db);

  const allAccounts = db
    .select({ id: accounts.id, type: accounts.type, isHidden: accounts.isHidden })
    .from(accounts)
    .where(scoped.where(accounts, notDeleted(accounts)))
    .all()
    .filter((a) => !a.isHidden);

  const accountTypeMap = new Map(allAccounts.map((a) => [a.id, a.type]));

  let filteredAccountIds = allAccounts.map((a) => a.id);
  if (filters.accountIds?.length) {
    filteredAccountIds = filteredAccountIds.filter((id) => filters.accountIds!.includes(id));
  }

  if (filteredAccountIds.length === 0) return [];

  const historyRows = db
    .select({
      accountId: balanceHistory.accountId,
      date: balanceHistory.date,
      balance: balanceHistory.balance,
    })
    .from(balanceHistory)
    .where(
      and(
        inArray(balanceHistory.accountId, filteredAccountIds),
        gte(balanceHistory.date, filters.dateFrom),
        lte(balanceHistory.date, filters.dateTo),
      ),
    )
    .all();

  const byDate = new Map<string, { assets: number; liabilities: number }>();
  for (const row of historyRows) {
    const type = accountTypeMap.get(row.accountId) ?? "other";
    const classification = classifyAccountType(type);
    if (!byDate.has(row.date)) {
      byDate.set(row.date, { assets: 0, liabilities: 0 });
    }
    const point = byDate.get(row.date)!;
    if (classification === "asset") {
      point.assets += row.balance;
    } else {
      point.liabilities += row.balance;
    }
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { assets, liabilities }]) => ({
      date,
      assets,
      liabilities,
      netWorth: assets - liabilities,
    }));
}
