import { eq, and, sql, desc, gte, lte, isNull, inArray } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { investmentHoldings, holdingsHistory, investmentTransactions, accounts } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { encodeCursor, decodeCursor, sumCol, countRows } from "@/lib/query-helpers";
import { todayDateString } from "@/lib/date-utils";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PortfolioSummary {
  /** What the accounts are actually worth: their balances, not the holdings sum. */
  totalValue: number;
  /** The itemized part. */
  holdingsValue: number;
  /** totalValue - holdingsValue: real uninvested cash, or value a connector did not itemize. */
  cashValue: number;
  /** Covers only the holdings portion -- it is derived from holdings_history. */
  dayChange: number | null;
  /** Covers only holdings that actually report a cost basis. */
  totalGainLoss: number;
  totalCostBasis: number;
  /** Current value of the holdings the gain/loss figure describes, so the UI can state its scope. */
  gainLossCoverage: number;
}

export interface AccountReconciliationRow {
  accountId: string;
  accountName: string;
  balance: number;
  holdingsValue: number;
  cashValue: number;
  /** False when the connector returned a balance but itemized nothing. */
  hasHoldings: boolean;
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

export interface InvestmentsSummaryHolding {
  ticker: string | null;
  securityName: string;
  currentValue: number;
  gainLossPercent: number | null;
  /** Share of total portfolio value, 0-100. */
  share: number;
}

export interface InvestmentsSummary {
  totalValue: number;
  dayChange: number | null;
  holdingCount: number;
  topHoldings: InvestmentsSummaryHolding[];
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

export async function getInvestmentAccountIds(householdId: string, db: LedgrDb = defaultDb): Promise<string[]> {
  const scoped = scopedQuery(householdId, db);
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(scoped.where(accounts, eq(accounts.type, "investment"), isNull(accounts.deletedAt)));
  return rows.map((r) => r.id);
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

async function resolveAccIds(householdId: string, db: LedgrDb, accIds?: string[]): Promise<string[]> {
  return accIds ?? getInvestmentAccountIds(householdId, db);
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function getPortfolioSummary(
  householdId: string,
  db: LedgrDb = defaultDb,
  today?: string,
  accIds?: string[],
): Promise<PortfolioSummary> {
  const ids = await resolveAccIds(householdId, db, accIds);
  if (ids.length === 0) {
    return {
      totalValue: 0,
      holdingsValue: 0,
      cashValue: 0,
      dayChange: null,
      totalGainLoss: 0,
      totalCostBasis: 0,
      gainLossCoverage: 0,
    };
  }

  const holdings = await db
    .select({
      currentValue: investmentHoldings.currentValue,
      costBasis: investmentHoldings.costBasis,
    })
    .from(investmentHoldings)
    .where(inArray(investmentHoldings.accountId, ids));

  let holdingsValue = 0;
  let totalCostBasis = 0;
  // Gain/loss must span the same set on both sides. Adding every holding to
  // the value side while skipping null-basis ones on the cost side reports a
  // holding's entire value as gain -- which is what inflated the total for
  // zero-basis positions like ETH and BTC.
  let gainLossCoverage = 0;
  for (const h of holdings) {
    holdingsValue += h.currentValue ?? 0;
    if (h.costBasis !== null) {
      totalCostBasis += h.costBasis;
      gainLossCoverage += h.currentValue ?? 0;
    }
  }

  // What the accounts are worth comes from their balances. Summing holdings
  // instead silently drops anything the connector did not itemize.
  const balanceRows = await db
    .select({ id: accounts.id, currentBalance: accounts.currentBalance })
    .from(accounts)
    .where(inArray(accounts.id, ids));
  const anyBalanceReported = balanceRows.some((r) => r.currentBalance !== null);
  const balanceTotal = balanceRows.reduce((sum, r) => sum + (r.currentBalance ?? 0), 0);

  // With no balance recorded anywhere, the holdings sum is the best figure we
  // have -- falling back keeps accounts that predate balance capture working.
  const totalValue = anyBalanceReported ? balanceTotal : holdingsValue;
  // Clamped: a stale balance below the holdings sum would otherwise show
  // negative cash, which is never a real state.
  const cashValue = Math.max(0, totalValue - holdingsValue);

  const todayStr = today ?? todayDateString();
  const prevDate = new Date(todayStr + "T00:00:00");
  prevDate.setDate(prevDate.getDate() - 1);
  const yesterdayStr = prevDate.toISOString().slice(0, 10);

  const [hasToday] = await db
    .select({ id: holdingsHistory.id })
    .from(holdingsHistory)
    .where(and(inArray(holdingsHistory.accountId, ids), eq(holdingsHistory.date, todayStr)))
    .limit(1);

  const [hasYesterday] = await db
    .select({ id: holdingsHistory.id })
    .from(holdingsHistory)
    .where(and(inArray(holdingsHistory.accountId, ids), eq(holdingsHistory.date, yesterdayStr)))
    .limit(1);

  let dayChange: number | null = null;
  if (hasToday && hasYesterday) {
    const [todayTotal] = await db
      .select({ total: sumCol(holdingsHistory.value) })
      .from(holdingsHistory)
      .where(and(inArray(holdingsHistory.accountId, ids), eq(holdingsHistory.date, todayStr)));

    const [yesterdayTotal] = await db
      .select({ total: sumCol(holdingsHistory.value) })
      .from(holdingsHistory)
      .where(and(inArray(holdingsHistory.accountId, ids), eq(holdingsHistory.date, yesterdayStr)));

    dayChange = (todayTotal?.total ?? 0) - (yesterdayTotal?.total ?? 0);
  }

  return {
    totalValue,
    holdingsValue,
    cashValue,
    dayChange,
    totalGainLoss: gainLossCoverage - totalCostBasis,
    totalCostBasis,
    gainLossCoverage,
  };
}

/**
 * Per-account balance-versus-holdings reconciliation.
 *
 * Investments derives its headline from holdings alone, so an account that
 * reports a balance but itemizes only part of it loses the difference with
 * nothing on screen to explain the shortfall (#88). This exposes the gap per
 * account so it can be shown as cash/unallocated, and flags accounts that
 * itemized nothing at all -- a connector gap, not a cash position.
 */
export async function getAccountReconciliation(
  householdId: string,
  db: LedgrDb = defaultDb,
  accIds?: string[],
): Promise<AccountReconciliationRow[]> {
  const ids = await resolveAccIds(householdId, db, accIds);
  if (ids.length === 0) return [];

  const accountRows = await db
    .select({ id: accounts.id, name: accounts.name, currentBalance: accounts.currentBalance })
    .from(accounts)
    .where(inArray(accounts.id, ids));

  const holdingRows = await db
    .select({
      accountId: investmentHoldings.accountId,
      value: sumCol(investmentHoldings.currentValue),
      count: countRows(),
    })
    .from(investmentHoldings)
    .where(inArray(investmentHoldings.accountId, ids))
    .groupBy(investmentHoldings.accountId);

  const byAccount = new Map(holdingRows.map((r) => [r.accountId, r]));

  return accountRows
    .map((a) => {
      const h = byAccount.get(a.id);
      const holdingsValue = h?.value ?? 0;
      const balance = a.currentBalance ?? holdingsValue;
      return {
        accountId: a.id,
        accountName: a.name,
        balance,
        holdingsValue,
        cashValue: Math.max(0, balance - holdingsValue),
        hasHoldings: (h?.count ?? 0) > 0,
      };
    })
    .sort((x, y) => y.balance - x.balance);
}

export async function getPortfolioHistory(
  householdId: string,
  dateRange: { dateFrom: string; dateTo: string },
  db: LedgrDb = defaultDb,
  accIds?: string[],
): Promise<PortfolioPoint[]> {
  const ids = await resolveAccIds(householdId, db, accIds);
  if (ids.length === 0) return [];

  return db
    .select({
      date: holdingsHistory.date,
      value: sumCol(holdingsHistory.value),
    })
    .from(holdingsHistory)
    .where(and(
      inArray(holdingsHistory.accountId, ids),
      gte(holdingsHistory.date, dateRange.dateFrom),
      lte(holdingsHistory.date, dateRange.dateTo),
    ))
    .groupBy(holdingsHistory.date)
    .orderBy(holdingsHistory.date);
}

export async function getAssetAllocation(
  householdId: string,
  db: LedgrDb = defaultDb,
  accIds?: string[],
): Promise<AllocationSlice[]> {
  const ids = await resolveAccIds(householdId, db, accIds);
  if (ids.length === 0) return [];

  const rows = await db
    .select({
      type: investmentHoldings.type,
      value: sumCol(investmentHoldings.currentValue),
    })
    .from(investmentHoldings)
    .where(inArray(investmentHoldings.accountId, ids))
    .groupBy(investmentHoldings.type);

  const total = rows.reduce((sum, r) => sum + (r.value ?? 0), 0);

  return rows.map((r) => ({
    type: r.type ?? "other",
    value: r.value ?? 0,
    percentage: total > 0 ? ((r.value ?? 0) / total) * 100 : 0,
  }));
}

export async function getHoldings(
  householdId: string,
  view: "consolidated" | "by-account",
  accountId: string | undefined,
  db: LedgrDb = defaultDb,
  accIds?: string[],
): Promise<InvestmentHoldingRow[]> {
  const allAccIds = await resolveAccIds(householdId, db, accIds);
  const filteredAccIds = accountId ? allAccIds.filter((id) => id === accountId) : allAccIds;
  if (filteredAccIds.length === 0) return [];

  if (view === "consolidated") {
    const rows = await db
      .select({
        ticker: investmentHoldings.ticker,
        securityName: investmentHoldings.securityName,
        type: sql<string | null>`MIN(${investmentHoldings.type})`,
        sector: sql<string | null>`MIN(${investmentHoldings.sector})`,
        quantity: sumCol(investmentHoldings.quantity),
        currentValue: sumCol(investmentHoldings.currentValue),
        costBasis: sumCol(investmentHoldings.costBasis),
      })
      .from(investmentHoldings)
      .where(inArray(investmentHoldings.accountId, filteredAccIds))
      .groupBy(investmentHoldings.ticker, investmentHoldings.securityName)
      .orderBy(sql`SUM(${investmentHoldings.currentValue}) DESC`);

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

  const rows = await db
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
    .where(inArray(investmentHoldings.accountId, filteredAccIds))
    .orderBy(sql`${investmentHoldings.currentValue} DESC`);

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

export async function getInvestmentTransactions(
  householdId: string,
  filters: InvestmentFilters = {},
  limit = 50,
  cursor: string | null = null,
  db: LedgrDb = defaultDb,
  accIds?: string[],
): Promise<InvTxnPage> {
  const allAccIds = await resolveAccIds(householdId, db, accIds);
  const filteredAccIds = filters.accountId
    ? allAccIds.filter((id) => id === filters.accountId)
    : allAccIds;
  if (filteredAccIds.length === 0) return { rows: [], nextCursor: null };

  const conditions: ReturnType<typeof eq>[] = [
    inArray(investmentTransactions.accountId, filteredAccIds) as ReturnType<typeof eq>,
  ];

  if (filters.type)
    conditions.push(
      eq(investmentTransactions.type, filters.type as "buy" | "sell" | "dividend" | "transfer" | "fee" | "other"),
    );
  if (filters.dateFrom) conditions.push(gte(investmentTransactions.date, filters.dateFrom) as ReturnType<typeof eq>);
  if (filters.dateTo) conditions.push(lte(investmentTransactions.date, filters.dateTo) as ReturnType<typeof eq>);

  const decoded = cursor ? decodeCursor(cursor) : null;
  if (decoded) {
    conditions.push(
      sql`(${investmentTransactions.date} < ${decoded.date} OR (${investmentTransactions.date} = ${decoded.date} AND ${investmentTransactions.id} < ${decoded.id}))` as ReturnType<typeof eq>,
    );
  }

  const rows = await db
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
    .limit(limit + 1);

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

export async function getInvestmentsSummary(
  householdId: string,
  db: LedgrDb = defaultDb,
): Promise<InvestmentsSummary> {
  const [summary, holdings] = await Promise.all([
    getPortfolioSummary(householdId, db),
    getHoldings(householdId, "consolidated", undefined, db),
  ]);

  // getHoldings returns consolidated positions already ordered by value, so the
  // dashboard widget just takes the head of the list. Anything past the top few
  // does not fit the cell and belongs on /investments.
  const topHoldings = holdings.slice(0, 3).map((h) => ({
    ticker: h.ticker,
    securityName: h.securityName,
    currentValue: h.currentValue,
    gainLossPercent: h.gainLossPercent,
    share: summary.totalValue > 0 ? (h.currentValue / summary.totalValue) * 100 : 0,
  }));

  return {
    totalValue: summary.totalValue,
    dayChange: summary.dayChange,
    holdingCount: holdings.length,
    topHoldings,
  };
}
