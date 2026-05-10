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

function investmentAccountIds(householdId: string, db: LedgrDb): string[] {
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

// ─── Queries ────────────────────────────────────────────────────────────────

export function getPortfolioSummary(
  householdId: string,
  db: LedgrDb = defaultDb,
  today?: string,
): PortfolioSummary {
  const accIds = investmentAccountIds(householdId, db);
  if (accIds.length === 0) return { totalValue: 0, dayChange: null, totalGainLoss: 0, totalCostBasis: 0 };

  const holdings = db
    .select({
      currentValue: investmentHoldings.currentValue,
      costBasis: investmentHoldings.costBasis,
    })
    .from(investmentHoldings)
    .where(sql`${investmentHoldings.accountId} IN (${sql.join(accIds.map((id) => sql`${id}`), sql`, `)})`)
    .all();

  let totalValue = 0;
  let totalCostBasis = 0;
  for (const h of holdings) {
    totalValue += h.currentValue ?? 0;
    if (h.costBasis !== null) totalCostBasis += h.costBasis;
  }

  // Day change: today vs yesterday
  const todayStr = today ?? todayDateString();
  const prevDate = new Date(todayStr + "T00:00:00");
  prevDate.setDate(prevDate.getDate() - 1);
  const yesterdayStr = prevDate.toISOString().slice(0, 10);

  const inAccIds = sql`${holdingsHistory.accountId} IN (${sql.join(accIds.map((id) => sql`${id}`), sql`, `)})`;

  const hasToday = db
    .select({ id: holdingsHistory.id })
    .from(holdingsHistory)
    .where(and(inAccIds, eq(holdingsHistory.date, todayStr)))
    .limit(1)
    .get();

  const hasYesterday = db
    .select({ id: holdingsHistory.id })
    .from(holdingsHistory)
    .where(and(inAccIds, eq(holdingsHistory.date, yesterdayStr)))
    .limit(1)
    .get();

  let dayChange: number | null = null;
  if (hasToday && hasYesterday) {
    const todayTotal = db
      .select({ total: sql<number>`COALESCE(SUM(${holdingsHistory.value}), 0)` })
      .from(holdingsHistory)
      .where(and(inAccIds, eq(holdingsHistory.date, todayStr)))
      .get();

    const yesterdayTotal = db
      .select({ total: sql<number>`COALESCE(SUM(${holdingsHistory.value}), 0)` })
      .from(holdingsHistory)
      .where(and(inAccIds, eq(holdingsHistory.date, yesterdayStr)))
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
): PortfolioPoint[] {
  const accIds = investmentAccountIds(householdId, db);
  if (accIds.length === 0) return [];

  return db
    .select({
      date: holdingsHistory.date,
      value: sql<number>`SUM(${holdingsHistory.value})`,
    })
    .from(holdingsHistory)
    .where(and(
      sql`${holdingsHistory.accountId} IN (${sql.join(accIds.map((id) => sql`${id}`), sql`, `)})`,
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
): AllocationSlice[] {
  const accIds = investmentAccountIds(householdId, db);
  if (accIds.length === 0) return [];

  const rows = db
    .select({
      type: investmentHoldings.type,
      value: sql<number>`SUM(${investmentHoldings.currentValue})`,
    })
    .from(investmentHoldings)
    .where(sql`${investmentHoldings.accountId} IN (${sql.join(accIds.map((id) => sql`${id}`), sql`, `)})`)
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
): InvestmentHoldingRow[] {
  const allAccIds = investmentAccountIds(householdId, db);
  const accIds = accountId ? allAccIds.filter((id) => id === accountId) : allAccIds;
  if (accIds.length === 0) return [];

  const inAccIds = sql`${investmentHoldings.accountId} IN (${sql.join(accIds.map((id) => sql`${id}`), sql`, `)})`;

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
      .where(inAccIds)
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
      gainLoss: r.costBasis !== null ? (r.currentValue ?? 0) - r.costBasis : null,
      gainLossPercent:
        r.costBasis !== null && r.costBasis !== 0
          ? (((r.currentValue ?? 0) - r.costBasis) / r.costBasis) * 100
          : null,
    }));
  }

  // by-account
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
    .where(inAccIds)
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
    gainLoss:
      r.costBasis !== null && r.currentValue !== null ? r.currentValue - r.costBasis : null,
    gainLossPercent:
      r.costBasis !== null && r.costBasis !== 0 && r.currentValue !== null
        ? ((r.currentValue - r.costBasis) / r.costBasis) * 100
        : null,
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
): InvTxnPage {
  const allAccIds = investmentAccountIds(householdId, db);
  const accIds = filters.accountId
    ? allAccIds.filter((id) => id === filters.accountId)
    : allAccIds;
  if (accIds.length === 0) return { rows: [], nextCursor: null };

  const conditions = [
    sql`${investmentTransactions.accountId} IN (${sql.join(accIds.map((id) => sql`${id}`), sql`, `)})`,
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
