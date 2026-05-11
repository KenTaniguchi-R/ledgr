import { eq, and, sql, desc, gte, lte, isNull } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { investmentHoldings, holdingsHistory, investmentTransactions, accounts } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { todayDateString } from "@/lib/date-utils";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PortfolioSummary {
  totalValue: number;
  dayChange: number | null;
  totalGainLoss: number;
  totalCostBasis: number;
}

export interface PortfolioPoint {
  date: string;
  value: number;
}

export interface AllocationSlice {
  type: string;
  value: number;
  percentage: number;
}

export interface InvestmentHoldingRow {
  ticker: string | null;
  securityName: string;
  type: string | null;
  sector: string | null;
  quantity: number;
  currentValue: number;
  costBasis: number | null;
  gainLoss: number | null;
  gainLossPercent: number | null;
  accountName?: string;
  accountId?: string;
}

export interface InvTxnRow {
  id: string;
  date: string;
  type: string | null;
  securityName: string | null;
  ticker: string | null;
  quantity: number | null;
  price: number | null;
  amount: number;
  fees: number | null;
  accountName: string;
}

export interface InvTxnPage {
  rows: InvTxnRow[];
  nextCursor: string | null;
}

export interface InvestmentFilters {
  type?: string;
  accountId?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function encodeCursor(date: string, id: string): string {
  return Buffer.from(JSON.stringify({ date, id })).toString("base64");
}

function decodeCursor(cursor: string): { date: string; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64").toString());
    if (typeof parsed.date === "string" && typeof parsed.id === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

export function getInvestmentAccountIds(householdId: string, db: LedgrDb = defaultDb): string[] {
  const scoped = scopedQuery(householdId, db);
  const rows = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(scoped.where(accounts, eq(accounts.type, "investment"), isNull(accounts.deletedAt)))
    .all();
  return rows.map((r) => r.id);
}

function inIds(column: { getSQL: () => unknown }, ids: string[]) {
  return sql`${column} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`;
}

function computeGainLoss(
  currentValue: number | null,
  costBasis: number | null,
): { gainLoss: number | null; gainLossPercent: number | null } {
  const cv = currentValue ?? 0;
  if (costBasis === null || currentValue === null) {
    return { gainLoss: null, gainLossPercent: null };
  }
  return {
    gainLoss: cv - costBasis,
    gainLossPercent: costBasis !== 0 ? ((cv - costBasis) / costBasis) * 100 : null,
  };
}

function resolveAccIds(householdId: string, db: LedgrDb, accIds?: string[]): string[] {
  return accIds ?? getInvestmentAccountIds(householdId, db);
}

// ─── Queries ────────────────────────────────────────────────────────────────

export function getPortfolioSummary(
  householdId: string,
  db: LedgrDb = defaultDb,
  today?: string,
  accIds?: string[],
): PortfolioSummary {
  const ids = resolveAccIds(householdId, db, accIds);
  if (ids.length === 0) return { totalValue: 0, dayChange: null, totalGainLoss: 0, totalCostBasis: 0 };

  const holdingsInAccIds = inIds(investmentHoldings.accountId, ids);
  const historyInAccIds = inIds(holdingsHistory.accountId, ids);

  const holdings = db
    .select({
      currentValue: investmentHoldings.currentValue,
      costBasis: investmentHoldings.costBasis,
    })
    .from(investmentHoldings)
    .where(holdingsInAccIds)
    .all();

  let totalValue = 0;
  let totalCostBasis = 0;
  for (const h of holdings) {
    totalValue += h.currentValue ?? 0;
    if (h.costBasis !== null) totalCostBasis += h.costBasis;
  }

  const todayStr = today ?? todayDateString();
  const prevDate = new Date(todayStr + "T00:00:00");
  prevDate.setDate(prevDate.getDate() - 1);
  const yesterdayStr = prevDate.toISOString().slice(0, 10);

  const hasToday = db
    .select({ id: holdingsHistory.id })
    .from(holdingsHistory)
    .where(and(historyInAccIds, eq(holdingsHistory.date, todayStr)))
    .limit(1)
    .get();

  const hasYesterday = db
    .select({ id: holdingsHistory.id })
    .from(holdingsHistory)
    .where(and(historyInAccIds, eq(holdingsHistory.date, yesterdayStr)))
    .limit(1)
    .get();

  let dayChange: number | null = null;
  if (hasToday && hasYesterday) {
    const todayTotal = db
      .select({ total: sql<number>`COALESCE(SUM(${holdingsHistory.value}), 0)` })
      .from(holdingsHistory)
      .where(and(historyInAccIds, eq(holdingsHistory.date, todayStr)))
      .get();

    const yesterdayTotal = db
      .select({ total: sql<number>`COALESCE(SUM(${holdingsHistory.value}), 0)` })
      .from(holdingsHistory)
      .where(and(historyInAccIds, eq(holdingsHistory.date, yesterdayStr)))
      .get();

    dayChange = (todayTotal?.total ?? 0) - (yesterdayTotal?.total ?? 0);
  }

  return {
    totalValue,
    dayChange,
    totalGainLoss: totalValue - totalCostBasis,
    totalCostBasis,
  };
}

export function getPortfolioHistory(
  householdId: string,
  dateRange: { dateFrom: string; dateTo: string },
  db: LedgrDb = defaultDb,
  accIds?: string[],
): PortfolioPoint[] {
  const ids = resolveAccIds(householdId, db, accIds);
  if (ids.length === 0) return [];

  return db
    .select({
      date: holdingsHistory.date,
      value: sql<number>`SUM(${holdingsHistory.value})`,
    })
    .from(holdingsHistory)
    .where(and(
      inIds(holdingsHistory.accountId, ids),
      gte(holdingsHistory.date, dateRange.dateFrom),
      lte(holdingsHistory.date, dateRange.dateTo),
    ))
    .groupBy(holdingsHistory.date)
    .orderBy(holdingsHistory.date)
    .all();
}

export function getAssetAllocation(
  householdId: string,
  db: LedgrDb = defaultDb,
  accIds?: string[],
): AllocationSlice[] {
  const ids = resolveAccIds(householdId, db, accIds);
  if (ids.length === 0) return [];

  const rows = db
    .select({
      type: investmentHoldings.type,
      value: sql<number>`SUM(${investmentHoldings.currentValue})`,
    })
    .from(investmentHoldings)
    .where(inIds(investmentHoldings.accountId, ids))
    .groupBy(investmentHoldings.type)
    .all();

  const total = rows.reduce((sum, r) => sum + (r.value ?? 0), 0);

  return rows.map((r) => ({
    type: r.type ?? "other",
    value: r.value ?? 0,
    percentage: total > 0 ? ((r.value ?? 0) / total) * 100 : 0,
  }));
}

export function getHoldings(
  householdId: string,
  view: "consolidated" | "by-account",
  accountId: string | undefined,
  db: LedgrDb = defaultDb,
  accIds?: string[],
): InvestmentHoldingRow[] {
  const allAccIds = resolveAccIds(householdId, db, accIds);
  const filteredAccIds = accountId ? allAccIds.filter((id) => id === accountId) : allAccIds;
  if (filteredAccIds.length === 0) return [];

  const holdingsFilter = inIds(investmentHoldings.accountId, filteredAccIds);

  if (view === "consolidated") {
    const rows = db
      .select({
        ticker: investmentHoldings.ticker,
        securityName: investmentHoldings.securityName,
        type: investmentHoldings.type,
        sector: investmentHoldings.sector,
        quantity: sql<number>`SUM(${investmentHoldings.quantity})`,
        currentValue: sql<number>`SUM(${investmentHoldings.currentValue})`,
        costBasis: sql<number | null>`SUM(${investmentHoldings.costBasis})`,
      })
      .from(investmentHoldings)
      .where(holdingsFilter)
      .groupBy(sql`COALESCE(${investmentHoldings.ticker}, ${investmentHoldings.securityName})`)
      .orderBy(sql`SUM(${investmentHoldings.currentValue}) DESC`)
      .all();

    return rows.map((r) => ({
      ticker: r.ticker,
      securityName: r.securityName,
      type: r.type,
      sector: r.sector,
      quantity: r.quantity ?? 0,
      currentValue: r.currentValue ?? 0,
      costBasis: r.costBasis,
      ...computeGainLoss(r.currentValue, r.costBasis),
    }));
  }

  const rows = db
    .select({
      ticker: investmentHoldings.ticker,
      securityName: investmentHoldings.securityName,
      type: investmentHoldings.type,
      sector: investmentHoldings.sector,
      quantity: investmentHoldings.quantity,
      currentValue: investmentHoldings.currentValue,
      costBasis: investmentHoldings.costBasis,
      accountName: accounts.name,
      accountId: investmentHoldings.accountId,
    })
    .from(investmentHoldings)
    .innerJoin(accounts, eq(investmentHoldings.accountId, accounts.id))
    .where(holdingsFilter)
    .orderBy(sql`${investmentHoldings.currentValue} DESC`)
    .all();

  return rows.map((r) => ({
    ticker: r.ticker,
    securityName: r.securityName,
    type: r.type,
    sector: r.sector,
    quantity: r.quantity ?? 0,
    currentValue: r.currentValue ?? 0,
    costBasis: r.costBasis,
    ...computeGainLoss(r.currentValue, r.costBasis),
    accountName: r.accountName,
    accountId: r.accountId,
  }));
}

export function getInvestmentTransactions(
  householdId: string,
  filters: InvestmentFilters = {},
  limit = 50,
  cursor: string | null = null,
  db: LedgrDb = defaultDb,
  accIds?: string[],
): InvTxnPage {
  const allAccIds = resolveAccIds(householdId, db, accIds);
  const filteredAccIds = filters.accountId
    ? allAccIds.filter((id) => id === filters.accountId)
    : allAccIds;
  if (filteredAccIds.length === 0) return { rows: [], nextCursor: null };

  const conditions = [
    inIds(investmentTransactions.accountId, filteredAccIds),
  ];

  if (filters.type)
    conditions.push(
      eq(investmentTransactions.type, filters.type as "buy" | "sell" | "dividend" | "transfer" | "fee" | "other"),
    );
  if (filters.dateFrom) conditions.push(gte(investmentTransactions.date, filters.dateFrom));
  if (filters.dateTo) conditions.push(lte(investmentTransactions.date, filters.dateTo));

  const decoded = cursor ? decodeCursor(cursor) : null;
  if (decoded) {
    conditions.push(
      sql`(${investmentTransactions.date} < ${decoded.date} OR (${investmentTransactions.date} = ${decoded.date} AND ${investmentTransactions.id} < ${decoded.id}))`,
    );
  }

  const rows = db
    .select({
      id: investmentTransactions.id,
      date: investmentTransactions.date,
      type: investmentTransactions.type,
      securityName: investmentTransactions.securityName,
      ticker: investmentTransactions.ticker,
      quantity: investmentTransactions.quantity,
      price: investmentTransactions.price,
      amount: investmentTransactions.amount,
      fees: investmentTransactions.fees,
      accountName: accounts.name,
    })
    .from(investmentTransactions)
    .innerJoin(accounts, eq(investmentTransactions.accountId, accounts.id))
    .where(and(...conditions))
    .orderBy(desc(investmentTransactions.date), desc(investmentTransactions.id))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  const nextCursor = hasMore
    ? encodeCursor(
        pageRows[pageRows.length - 1].date,
        pageRows[pageRows.length - 1].id,
      )
    : null;

  return { rows: pageRows, nextCursor };
}

export function getInvestmentsSummary(
  householdId: string,
  db: LedgrDb = defaultDb,
): { totalValue: number; dayChange: number | null } {
  const summary = getPortfolioSummary(householdId, db);
  return { totalValue: summary.totalValue, dayChange: summary.dayChange };
}
