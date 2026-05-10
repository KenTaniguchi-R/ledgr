import { eq, gt, gte, lte, desc } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  accounts,
  balanceHistory,
  transactions,
  categories,
  categoryGroups,
} from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";
import { classifyAccountType } from "@/lib/account-utils";
import { todayDateString, rangeToDateBounds } from "@/lib/date-utils";
import { baseTransactionQuery, type TransactionRow } from "./transactions";

// ─── helpers ────────────────────────────────────────────────────────────────

function currentMonthBounds(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const dateFrom = `${year}-${month}-01`;
  // Last day of month
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  const dateTo = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
  return { dateFrom, dateTo };
}

// ─── getDashboardSummary ────────────────────────────────────────────────────

export interface DashboardSummary {
  netWorth: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyNet: number;
}

export function getDashboardSummary(
  householdId: string,
  db: LedgrDb = defaultDb
): DashboardSummary {
  const scoped = scopedQuery(householdId, db);

  // Net worth from live account balances
  const allAccounts = db
    .select()
    .from(accounts)
    .where(scoped.where(accounts, notDeleted(accounts)))
    .all();

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

  const { dateFrom, dateTo } = currentMonthBounds();

  // Monthly transactions (non-pending, non-deleted)
  const monthlyTxns = db
    .select({
      normalizedAmount: transactions.normalizedAmount,
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
    )
    .all();

  let monthlyIncome = 0;
  let monthlyExpenses = 0;
  for (const txn of monthlyTxns) {
    if (txn.normalizedAmount > 0) {
      monthlyExpenses += txn.normalizedAmount;
    } else {
      monthlyIncome += Math.abs(txn.normalizedAmount);
    }
  }

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

export function getNetWorthHistory(
  householdId: string,
  range: "1M" | "3M" | "6M" | "1Y" | "all" = "6M",
  db: LedgrDb = defaultDb
): NetWorthPoint[] {
  const scoped = scopedQuery(householdId, db);
  const { from: dateFrom } = rangeToDateBounds(range);

  // Get accounts for classification
  const allAccounts = db
    .select({ id: accounts.id, type: accounts.type })
    .from(accounts)
    .where(scoped.where(accounts, notDeleted(accounts)))
    .all();

  const accountTypeMap = new Map(allAccounts.map((a) => [a.id, a.type]));
  const accountIds = allAccounts.map((a) => a.id);

  // Get balance history rows
  type BalanceRow = { accountId: string; date: string; balance: number };
  let historyRows: BalanceRow[] = [];

  if (accountIds.length > 0) {
    const allHistory = db
      .select({
        accountId: balanceHistory.accountId,
        date: balanceHistory.date,
        balance: balanceHistory.balance,
      })
      .from(balanceHistory)
      .all();

    historyRows = allHistory.filter((row) => accountTypeMap.has(row.accountId));
    if (dateFrom) {
      historyRows = historyRows.filter((row) => row.date >= dateFrom);
    }
  }

  // Aggregate by date
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

  // Build sorted historical points
  const result: NetWorthPoint[] = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { assets, liabilities }]) => ({
      date,
      assets,
      liabilities,
      netWorth: assets - liabilities,
    }));

  // Synthetic today point from live currentBalance
  const today = todayDateString();
  // Remove any existing today entry from history (will be replaced by live)
  const withoutToday = result.filter((p) => p.date !== today);

  const liveTodayAccounts = db
    .select({ id: accounts.id, type: accounts.type, currentBalance: accounts.currentBalance })
    .from(accounts)
    .where(scoped.where(accounts, notDeleted(accounts)))
    .all();

  let todayAssets = 0;
  let todayLiabilities = 0;
  for (const account of liveTodayAccounts) {
    if (account.currentBalance === null) continue;
    if (classifyAccountType(account.type) === "asset") {
      todayAssets += account.currentBalance;
    } else {
      todayLiabilities += account.currentBalance;
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

export function getMonthlySpending(
  householdId: string,
  month?: string,
  db: LedgrDb = defaultDb
): MonthlySpendingRow[] {
  const scoped = scopedQuery(householdId, db);

  const targetMonth = month ?? new Date().toISOString().slice(0, 7);
  const dateFrom = `${targetMonth}-01`;
  // Last day of month
  const [year, mon] = targetMonth.split("-").map(Number);
  const lastDay = new Date(year, mon, 0).getDate();
  const dateTo = `${targetMonth}-${String(lastDay).padStart(2, "0")}`;

  // Get expense transactions (positive normalizedAmount, non-pending, non-deleted)
  const expenseTxns = db
    .select({
      categoryId: transactions.categoryId,
      normalizedAmount: transactions.normalizedAmount,
    })
    .from(transactions)
    .where(
      scoped.where(
        transactions,
        notDeleted(transactions),
        gte(transactions.date, dateFrom),
        lte(transactions.date, dateTo),
        eq(transactions.pending, false),
        gt(transactions.normalizedAmount, 0)
      )
    )
    .all();

  // Aggregate by categoryId
  const byCategory = new Map<string | null, number>();
  for (const txn of expenseTxns) {
    const key = txn.categoryId;
    byCategory.set(key, (byCategory.get(key) ?? 0) + txn.normalizedAmount);
  }

  if (byCategory.size === 0) return [];

  // Fetch category details
  const categoryIds = [...byCategory.keys()].filter((id): id is string => id !== null);

  type CatRow = { id: string; name: string; icon: string | null; groupName: string | null };
  let catRows: CatRow[] = [];
  if (categoryIds.length > 0) {
    const allCats = db
      .select({
        id: categories.id,
        name: categories.name,
        icon: categories.icon,
        groupName: categoryGroups.name,
      })
      .from(categories)
      .leftJoin(categoryGroups, eq(categories.groupId, categoryGroups.id))
      .all();

    catRows = allCats.filter((c) => categoryIds.includes(c.id));
  }

  const catMap = new Map(catRows.map((c) => [c.id, c]));

  const result: MonthlySpendingRow[] = [];

  for (const [categoryId, total] of byCategory.entries()) {
    if (categoryId === null) {
      result.push({
        categoryId: null,
        categoryName: "Uncategorized",
        categoryIcon: null,
        groupName: null,
        total,
      });
    } else {
      const cat = catMap.get(categoryId);
      result.push({
        categoryId,
        categoryName: cat?.name ?? "Unknown",
        categoryIcon: cat?.icon ?? null,
        groupName: cat?.groupName ?? null,
        total,
      });
    }
  }

  return result.sort((a, b) => b.total - a.total);
}

// ─── getCashFlow ─────────────────────────────────────────────────────────────

export interface CashFlowRow {
  month: string; // YYYY-MM
  income: number;
  expenses: number;
  net: number;
}

export function getCashFlow(
  householdId: string,
  months = 6,
  db: LedgrDb = defaultDb
): CashFlowRow[] {
  const scoped = scopedQuery(householdId, db);

  // Calculate dateFrom based on months back
  const now = new Date();
  now.setMonth(now.getMonth() - (months - 1));
  now.setDate(1);
  const dateFrom = now.toISOString().slice(0, 10);

  const txns = db
    .select({
      date: transactions.date,
      normalizedAmount: transactions.normalizedAmount,
    })
    .from(transactions)
    .where(
      scoped.where(
        transactions,
        notDeleted(transactions),
        gte(transactions.date, dateFrom),
        eq(transactions.pending, false)
      )
    )
    .all();

  const byMonth = new Map<string, { income: number; expenses: number }>();
  for (const txn of txns) {
    const month = txn.date.slice(0, 7); // YYYY-MM
    if (!byMonth.has(month)) {
      byMonth.set(month, { income: 0, expenses: 0 });
    }
    const entry = byMonth.get(month)!;
    if (txn.normalizedAmount > 0) {
      entry.expenses += txn.normalizedAmount;
    } else {
      entry.income += Math.abs(txn.normalizedAmount);
    }
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { income, expenses }]) => ({
      month,
      income,
      expenses,
      net: income - expenses,
    }));
}

// ─── getRecentTransactions ───────────────────────────────────────────────────

export function getRecentTransactions(
  householdId: string,
  limit = 5,
  db: LedgrDb = defaultDb
): TransactionRow[] {
  const base = baseTransactionQuery(db, householdId);

  const rows = base
    .joins(db.select(base.select).from(base.from))
    .where(base.scoped.where(transactions, notDeleted(transactions)))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(limit)
    .all();

  return rows.map((row: typeof rows[0]) => ({
    ...row,
    accountName: row.accountName ?? "",
    currency: row.currency ?? "USD",
    pending: Boolean(row.pending),
    reviewed: Boolean(row.reviewed),
    hasSplits: false,
  }));
}
