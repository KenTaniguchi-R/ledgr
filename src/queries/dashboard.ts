import { eq, gte, lte, and, desc, inArray, isNull, sql } from "drizzle-orm";
export { getInvestmentsSummary } from "./investments";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  accounts,
  balanceHistory,
  transactions,
} from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";
import { getIncomeCategoryIds } from "@/queries/shared-conditions";
import { aggregateSpending, enrichSpendingMap } from "@/lib/spending-helpers";
import type { ReportFilters } from "@/queries/reports";
import { classifyAccountType } from "@/lib/account-utils";
import { todayDateString, rangeToDateBounds, monthBounds, getCurrentMonth } from "@/lib/date-utils";
import { baseTransactionQuery, type TransactionRow } from "./transactions";

// ─── getDashboardSummary ────────────────────────────────────────────────────

export interface DashboardSummary {
  netWorth: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyNet: number;
}

/**
 * YYYY-MM of the household's most recent non-pending transaction, or null when
 * there is no activity. Used to resolve the "effective" dashboard month so a
 * returning user whose latest data is from an earlier month doesn't land on an
 * all-zero current month.
 */
export async function getLatestActivityMonth(
  householdId: string,
  db: LedgrDb = defaultDb
): Promise<string | null> {
  const scoped = scopedQuery(householdId, db);

  const rows = await db
    .select({ date: transactions.date })
    .from(transactions)
    .where(
      scoped.where(
        transactions,
        notDeleted(transactions),
        eq(transactions.pending, false)
      )
    )
    .orderBy(desc(transactions.date))
    .limit(1);

  return rows.length > 0 ? rows[0].date.slice(0, 7) : null;
}

export async function getDashboardSummary(
  householdId: string,
  month?: string,
  db: LedgrDb = defaultDb
): Promise<DashboardSummary> {
  const scoped = scopedQuery(householdId, db);

  // Net worth from live account balances (only the columns we classify/sum)
  const allAccounts = await db
    .select({
      type: accounts.type,
      currentBalance: accounts.currentBalance,
      isHidden: accounts.isHidden,
    })
    .from(accounts)
    .where(scoped.where(accounts, notDeleted(accounts)));

  let totalAssets = 0;
  let totalLiabilities = 0;
  for (const account of allAccounts) {
    if (account.isHidden || account.currentBalance === null) continue;
    if (classifyAccountType(account.type) === "asset") {
      totalAssets += account.currentBalance;
    } else {
      totalLiabilities += account.currentBalance;
    }
  }

  const effectiveMonth =
    month ?? (await getLatestActivityMonth(householdId, db)) ?? getCurrentMonth();
  const { from: dateFrom, to: dateTo } = monthBounds(effectiveMonth);

  // Sum income/expenses in SQL rather than pulling every month row into JS.
  // Mirrors the prior logic: amount >= 0 → income, amount < 0 → expenses.
  const [totals] = await db
    .select({
      income: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.normalizedAmount} > 0 THEN ${transactions.normalizedAmount} ELSE 0 END), 0)`.mapWith(Number),
      expenses: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.normalizedAmount} < 0 THEN ABS(${transactions.normalizedAmount}) ELSE 0 END), 0)`.mapWith(Number),
    })
    .from(transactions)
    .where(
      scoped.where(
        transactions,
        notDeleted(transactions),
        gte(transactions.date, dateFrom),
        lte(transactions.date, dateTo),
        eq(transactions.pending, false)
      )
    );

  const monthlyIncome = totals?.income ?? 0;
  const monthlyExpenses = totals?.expenses ?? 0;

  return {
    netWorth: totalAssets - totalLiabilities,
    monthlyIncome,
    monthlyExpenses,
    monthlyNet: monthlyIncome - monthlyExpenses,
  };
}

// ─── getNetWorthHistory ─────────────────────────────────────────────────────

export interface NetWorthPoint {
  date: string;
  assets: number;
  liabilities: number;
  netWorth: number;
}

export async function getNetWorthHistory(
  householdId: string,
  range: "1M" | "3M" | "6M" | "1Y" | "all" = "6M",
  db: LedgrDb = defaultDb
): Promise<NetWorthPoint[]> {
  const scoped = scopedQuery(householdId, db);
  const { from: dateFrom } = rangeToDateBounds(range);

  const allAccounts = await db
    .select({ id: accounts.id, type: accounts.type, currentBalance: accounts.currentBalance })
    .from(accounts)
    .where(scoped.where(accounts, notDeleted(accounts)));

  const accountTypeMap = new Map(allAccounts.map((a) => [a.id, a.type]));
  const accountIds = allAccounts.map((a) => a.id);

  // Partition accounts by type once, then sum each side in SQL via
  // SUM(CASE WHEN account_id IN (...)) grouped by date instead of pulling every
  // balance row into JS.
  const assetIds = accountIds.filter(
    (id) => classifyAccountType(accountTypeMap.get(id) ?? "other") === "asset",
  );
  const liabilityIds = accountIds.filter(
    (id) => classifyAccountType(accountTypeMap.get(id) ?? "other") === "liability",
  );

  let result: NetWorthPoint[] = [];
  if (accountIds.length > 0) {
    const inAssets = assetIds.length > 0 ? inArray(balanceHistory.accountId, assetIds) : sql`false`;
    const inLiabilities =
      liabilityIds.length > 0 ? inArray(balanceHistory.accountId, liabilityIds) : sql`false`;

    const conditions = [inArray(balanceHistory.accountId, accountIds)];
    if (dateFrom) {
      conditions.push(gte(balanceHistory.date, dateFrom));
    }

    const rows = await db
      .select({
        date: balanceHistory.date,
        assets: sql<number>`COALESCE(SUM(CASE WHEN ${inAssets} THEN ${balanceHistory.balance} ELSE 0 END), 0)`.mapWith(Number),
        liabilities: sql<number>`COALESCE(SUM(CASE WHEN ${inLiabilities} THEN ${balanceHistory.balance} ELSE 0 END), 0)`.mapWith(Number),
      })
      .from(balanceHistory)
      .where(and(...conditions))
      .groupBy(balanceHistory.date)
      .orderBy(balanceHistory.date);

    result = rows.map(({ date, assets, liabilities }) => ({
      date,
      assets,
      liabilities,
      netWorth: assets - liabilities,
    }));
  }

  // Synthetic today point from live currentBalance. Only emit it when at least
  // one account carries a balance — otherwise there is no net worth to plot and
  // a zero point would render as a degenerate chart instead of an empty state.
  const today = todayDateString();
  // Remove any existing today entry from history (will be replaced by live)
  const withoutToday = result.filter((p) => p.date !== today);

  const accountsWithBalance = allAccounts.filter((a) => a.currentBalance !== null);
  if (accountsWithBalance.length === 0) {
    return withoutToday;
  }

  let todayAssets = 0;
  let todayLiabilities = 0;
  for (const account of accountsWithBalance) {
    if (classifyAccountType(account.type) === "asset") {
      todayAssets += account.currentBalance!;
    } else {
      todayLiabilities += account.currentBalance!;
    }
  }

  withoutToday.push({
    date: today,
    assets: todayAssets,
    liabilities: todayLiabilities,
    netWorth: todayAssets - todayLiabilities,
  });

  return withoutToday;
}

// ─── getMonthlySpending ──────────────────────────────────────────────────────

export interface MonthlySpendingRow {
  categoryId: string | null;
  categoryName: string;
  categoryIcon: string | null;
  groupName: string | null;
  total: number;
}

export async function getMonthlySpending(
  householdId: string,
  month?: string,
  db: LedgrDb = defaultDb
): Promise<MonthlySpendingRow[]> {
  const targetMonth = month ?? (await getLatestActivityMonth(householdId, db)) ?? getCurrentMonth();
  const { from: dateFrom, to: dateTo } = monthBounds(targetMonth);

  const filters: ReportFilters = { dateFrom, dateTo };
  const spending = await aggregateSpending(householdId, filters, db);
  const enriched = await enrichSpendingMap(spending, db);

  return enriched.map((item) => ({
    categoryId: item.id,
    categoryName: item.name,
    categoryIcon: null,
    groupName: item.groupName,
    total: item.value,
  }));
}

// ─── getCashFlow ─────────────────────────────────────────────────────────────

export interface CashFlowRow {
  month: string; // YYYY-MM
  income: number;
  expenses: number;
  net: number;
}

export async function getCashFlow(
  householdId: string,
  months = 6,
  db: LedgrDb = defaultDb
): Promise<CashFlowRow[]> {
  const scoped = scopedQuery(householdId, db);

  const today = todayDateString();
  const d = new Date(today + "T00:00:00");
  d.setMonth(d.getMonth() - (months - 1));
  d.setDate(1);
  const dateFrom = d.toISOString().slice(0, 10);

  const incomeCatIds = [...(await getIncomeCategoryIds(db))];

  // COALESCE(...,false): a null or non-income category is treated as non-income,
  // matching the prior `txn.categoryId && incomeCatIds.has(...)` check. When
  // there are no income categories, the predicate is a constant false.
  const isIncome =
    incomeCatIds.length > 0
      ? sql`COALESCE(${inArray(transactions.categoryId, incomeCatIds)}, false)`
      : sql`false`;
  const monthExpr = sql<string>`substring(${transactions.date}, 1, 7)`;

  const rows = await db
    .select({
      month: monthExpr,
      income: sql<number>`COALESCE(SUM(CASE WHEN ${isIncome} THEN ABS(${transactions.normalizedAmount}) ELSE 0 END), 0)`.mapWith(Number),
      expenses: sql<number>`COALESCE(SUM(CASE WHEN NOT (${isIncome}) AND ${transactions.normalizedAmount} < 0 THEN ABS(${transactions.normalizedAmount}) ELSE 0 END), 0)`.mapWith(Number),
    })
    .from(transactions)
    .where(
      scoped.where(
        transactions,
        notDeleted(transactions),
        gte(transactions.date, dateFrom),
        eq(transactions.pending, false),
        eq(transactions.isTransfer, false),
        isNull(transactions.transferPairId)
      )
    )
    .groupBy(monthExpr)
    .orderBy(monthExpr);

  return rows.map(({ month, income, expenses }) => ({
    month,
    income,
    expenses,
    net: income - expenses,
  }));
}

// ─── getRecentTransactions ───────────────────────────────────────────────────

export async function getRecentTransactions(
  householdId: string,
  limit = 5,
  db: LedgrDb = defaultDb
): Promise<TransactionRow[]> {
  const base = baseTransactionQuery(db, householdId);

  const rows = await base
    .joins(db.select(base.select).from(base.from))
    .where(base.scoped.where(transactions, notDeleted(transactions)))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(limit);

  return rows.map((row: typeof rows[0]) => ({
    ...row,
    accountName: row.accountName ?? "",
    currency: row.currency ?? "USD",
    pending: Boolean(row.pending),
    reviewed: Boolean(row.reviewed),
    hasSplits: false,
  }));
}
