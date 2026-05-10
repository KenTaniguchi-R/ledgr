import { eq, gt, gte, lte, sql, and, inArray, notInArray, isNull } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  transactions,
  transactionSplits,
  categories,
  categoryGroups,
  accounts,
  balanceHistory,
} from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted, notIncome } from "@/lib/query-helpers";
import { classifyAccountType } from "@/lib/account-utils";

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

// ── Shared base conditions ──────────────────────────────────────────

function spendingBaseConditions(filters: ReportFilters, db: LedgrDb) {
  const conditions = [
    notDeleted(transactions),
    gt(transactions.normalizedAmount, 0),
    eq(transactions.pending, false),
    eq(transactions.isTransfer, false),
    isNull(transactions.transferPairId),
    gte(transactions.date, filters.dateFrom),
    lte(transactions.date, filters.dateTo),
    notIncome(db),
  ];
  if (filters.accountIds?.length) {
    conditions.push(inArray(transactions.accountId, filters.accountIds));
  }
  return conditions;
}

// ── Split-aware helpers ────────────────────────────────────────────

function findSplitParentIds(
  scoped: ReturnType<typeof scopedQuery>,
  conditions: ReturnType<typeof spendingBaseConditions>,
  db: LedgrDb,
): string[] {
  return db
    .select({ transactionId: transactionSplits.transactionId })
    .from(transactionSplits)
    .innerJoin(transactions, eq(transactionSplits.transactionId, transactions.id))
    .where(scoped.where(transactions, ...conditions))
    .groupBy(transactionSplits.transactionId)
    .all()
    .map((r) => r.transactionId);
}

// ── Split-aware spending aggregation ────────────────────────────────

function aggregateSpending(
  householdId: string,
  filters: ReportFilters,
  db: LedgrDb,
): Map<string, number> {
  const scoped = scopedQuery(householdId, db);
  const conditions = spendingBaseConditions(filters, db);

  const splitParentIds = findSplitParentIds(scoped, conditions, db);

  // Non-split transactions
  const nonSplitConditions =
    splitParentIds.length > 0
      ? [...conditions, notInArray(transactions.id, splitParentIds)]
      : conditions;

  const nonSplitRows = db
    .select({
      categoryId: transactions.categoryId,
      total: sql<number>`COALESCE(SUM(${transactions.normalizedAmount}), 0)`,
    })
    .from(transactions)
    .where(scoped.where(transactions, ...nonSplitConditions))
    .groupBy(transactions.categoryId)
    .all();

  const spending = new Map<string, number>();
  for (const row of nonSplitRows) {
    const key = row.categoryId ?? "uncategorized";
    spending.set(key, (spending.get(key) ?? 0) + row.total);
  }

  // Split transactions
  if (splitParentIds.length > 0) {
    const splitRows = db
      .select({
        categoryId: transactionSplits.categoryId,
        total: sql<number>`COALESCE(SUM(${transactionSplits.amount}), 0)`,
      })
      .from(transactionSplits)
      .where(inArray(transactionSplits.transactionId, splitParentIds))
      .groupBy(transactionSplits.categoryId)
      .all();

    for (const row of splitRows) {
      spending.set(row.categoryId, (spending.get(row.categoryId) ?? 0) + row.total);
    }
  }

  return spending;
}

function enrichSpendingMap(
  spending: Map<string, number>,
  db: LedgrDb,
): Omit<SpendingRow, "prevTotal">[] {
  const categoryIds = [...spending.keys()].filter((k) => k !== "uncategorized");

  type CatRow = { id: string; name: string; groupName: string | null; groupId: string | null };
  let catRows: CatRow[] = [];
  if (categoryIds.length > 0) {
    catRows = db
      .select({
        id: categories.id,
        name: categories.name,
        groupName: categoryGroups.name,
        groupId: categoryGroups.id,
      })
      .from(categories)
      .leftJoin(categoryGroups, eq(categories.groupId, categoryGroups.id))
      .where(inArray(categories.id, categoryIds))
      .all();
  }

  const catMap = new Map(catRows.map((c) => [c.id, c]));
  const result: Omit<SpendingRow, "prevTotal">[] = [];

  for (const [key, total] of spending.entries()) {
    if (key === "uncategorized") {
      result.push({ categoryId: null, categoryName: "Uncategorized", groupName: null, groupId: null, total });
    } else {
      const cat = catMap.get(key);
      result.push({
        categoryId: key,
        categoryName: cat?.name ?? "Unknown",
        groupName: cat?.groupName ?? null,
        groupId: cat?.groupId ?? null,
        total,
      });
    }
  }

  return result.sort((a, b) => b.total - a.total);
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
    ...row,
    prevTotal: prevMap.get(row.categoryId ?? "uncategorized") ?? 0,
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

  const incomeCatIds = new Set(
    db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.isIncome, true))
      .all()
      .map((r) => r.id),
  );

  const byMonth = new Map<string, { income: number; expenses: number }>();
  for (const txn of txns) {
    const month = txn.date.slice(0, 7);
    if (!byMonth.has(month)) {
      byMonth.set(month, { income: 0, expenses: 0 });
    }
    const entry = byMonth.get(month)!;
    if (txn.categoryId && incomeCatIds.has(txn.categoryId)) {
      entry.income += Math.abs(txn.normalizedAmount);
    } else {
      entry.expenses += txn.normalizedAmount;
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
      total: sql<number>`COALESCE(SUM(${transactions.normalizedAmount}), 0)`,
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
