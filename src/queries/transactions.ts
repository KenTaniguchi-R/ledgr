import { eq, like, gte, lte, lt, gt, isNull, desc, sql, inArray, type SQL } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { transactions, categories, categoryGroups, merchants, accounts, transactionSplits } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";

export interface TransactionFilters {
  dateFrom?: string;
  dateTo?: string;
  accountId?: string;
  categoryId?: string | null;
  reviewed?: boolean;
  search?: string;
  amountMin?: number;
  amountMax?: number;
  transactionType?: "expense" | "credits" | "transfer";
}

export interface TransactionRow {
  id: string;
  date: string;
  name: string;
  originalName: string;
  amount: number;
  normalizedAmount: number;
  currency: string;
  pending: boolean;
  reviewed: boolean;
  accountId: string;
  accountName: string;
  merchantId: string | null;
  merchantName: string | null;
  merchantLogoUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryGroupName: string | null;
  categoryIcon: string | null;
  pfcPrimary: string | null;
  notes: string | null;
  hasSplits: boolean;
  isTransfer: boolean;
  transferPairId: string | null;
  categorySource: string | null;
  plaidTransactionId: string | null;
}

export interface TransactionPage {
  rows: TransactionRow[];
  nextCursor: string | null;
}

export const transactionSelectFields = {
  id: transactions.id,
  date: transactions.date,
  name: transactions.name,
  originalName: transactions.originalName,
  amount: transactions.amount,
  normalizedAmount: transactions.normalizedAmount,
  currency: transactions.currency,
  pending: transactions.pending,
  reviewed: transactions.reviewed,
  accountId: transactions.accountId,
  accountName: accounts.name,
  merchantId: transactions.merchantId,
  merchantName: merchants.name,
  merchantLogoUrl: merchants.logoUrl,
  categoryId: transactions.categoryId,
  categoryName: categories.name,
  categoryGroupName: categoryGroups.name,
  categoryIcon: categories.icon,
  pfcPrimary: transactions.pfcPrimary,
  notes: transactions.notes,
  isTransfer: transactions.isTransfer,
  transferPairId: transactions.transferPairId,
  categorySource: transactions.categorySource,
  plaidTransactionId: transactions.plaidTransactionId,
};

export function baseTransactionQuery(db: LedgrDb, householdId: string) {
  const scoped = scopedQuery(householdId, db);
  const select = transactionSelectFields;
  const from = transactions;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function joins(query: any) {
    return query
      .leftJoin(accounts, eq(transactions.accountId, accounts.id))
      .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(categoryGroups, eq(categories.groupId, categoryGroups.id));
  }
  return { scoped, select, from, joins };
}

function encodeCursor(date: string, id: string): string {
  return Buffer.from(JSON.stringify({ date, id })).toString("base64");
}

function decodeCursor(cursor: string): { date: string; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64").toString());
    if (typeof parsed.date === "string" && typeof parsed.id === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function buildTransactionConditions(filters: TransactionFilters): (SQL | undefined)[] {
  const conditions: (SQL | undefined)[] = [notDeleted(transactions)];

  if (filters.dateFrom) {
    conditions.push(gte(transactions.date, filters.dateFrom));
  }
  if (filters.dateTo) {
    conditions.push(lte(transactions.date, filters.dateTo));
  }
  if (filters.accountId) {
    conditions.push(eq(transactions.accountId, filters.accountId));
  }
  if (filters.categoryId === null) {
    conditions.push(isNull(transactions.categoryId));
  } else if (filters.categoryId !== undefined) {
    conditions.push(eq(transactions.categoryId, filters.categoryId));
  }
  if (filters.reviewed !== undefined) {
    conditions.push(eq(transactions.reviewed, filters.reviewed));
  }
  if (filters.search) {
    conditions.push(like(transactions.name, `%${filters.search}%`));
  }
  if (filters.amountMin !== undefined) {
    conditions.push(sql`abs(${transactions.normalizedAmount}) >= ${filters.amountMin}`);
  }
  if (filters.amountMax !== undefined) {
    conditions.push(sql`abs(${transactions.normalizedAmount}) <= ${filters.amountMax}`);
  }
  if (filters.transactionType === "expense") {
    conditions.push(lt(transactions.normalizedAmount, 0));
    conditions.push(eq(transactions.isTransfer, false));
  }
  if (filters.transactionType === "credits") {
    conditions.push(gt(transactions.normalizedAmount, 0));
    conditions.push(eq(transactions.isTransfer, false));
  }
  if (filters.transactionType === "transfer") {
    conditions.push(eq(transactions.isTransfer, true));
  }

  return conditions;
}

export function getTransactions(
  householdId: string,
  filters: TransactionFilters = {},
  limit = 50,
  cursor: string | null = null,
  db: LedgrDb = defaultDb,
): TransactionPage {
  const conditions = buildTransactionConditions(filters);

  // Cursor conditions stay here — not in the shared builder
  const decoded = cursor ? decodeCursor(cursor) : null;
  if (decoded) {
    conditions.push(
      sql`(${transactions.date} < ${decoded.date} OR (${transactions.date} = ${decoded.date} AND ${transactions.id} < ${decoded.id}))`,
    );
  }

  const base = baseTransactionQuery(db, householdId);
  const rows = base.joins(db.select(base.select).from(base.from))
    .where(base.scoped.where(transactions, ...conditions))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  const pageIds = pageRows.map((r: typeof pageRows[0]) => r.id);
  const splitRows = pageIds.length > 0
    ? db
        .select({
          transactionId: transactionSplits.transactionId,
          count: sql<number>`count(*)`,
        })
        .from(transactionSplits)
        .where(inArray(transactionSplits.transactionId, pageIds))
        .groupBy(transactionSplits.transactionId)
        .all()
    : [];
  const splitSet = new Set(splitRows.filter((r) => r.count > 0).map((r) => r.transactionId));

  const result: TransactionRow[] = pageRows.map((row: typeof pageRows[0]) => ({
    ...row,
    accountName: row.accountName ?? "",
    currency: row.currency ?? "USD",
    pending: Boolean(row.pending),
    reviewed: Boolean(row.reviewed),
    hasSplits: splitSet.has(row.id),
    isTransfer: Boolean(row.isTransfer),
    transferPairId: row.transferPairId ?? null,
    categorySource: row.categorySource ?? null,
    plaidTransactionId: row.plaidTransactionId ?? null,
  }));

  const nextCursor = hasMore
    ? encodeCursor(pageRows[pageRows.length - 1].date, pageRows[pageRows.length - 1].id)
    : null;

  return { rows: result, nextCursor };
}

export interface SplitRow {
  id: string;
  categoryId: string;
  categoryName: string | null;
  categoryIcon: string | null;
  amount: number;
  notes: string | null;
}

export interface TransactionDetail extends TransactionRow {
  splits: SplitRow[];
}

export interface TransactionSummary {
  count: number;
  totalExpense: number;
  totalIncome: number;
  net: number;
}

export function getTransactionSummary(
  householdId: string,
  filters: TransactionFilters,
  db: LedgrDb = defaultDb,
): TransactionSummary {
  const conditions = buildTransactionConditions(filters);
  const base = baseTransactionQuery(db, householdId);

  const result = db
    .select({
      count: sql<number>`count(*)`,
      totalExpense: sql<number>`coalesce(sum(CASE WHEN ${transactions.normalizedAmount} < 0 AND ${transactions.isTransfer} = 0 AND ${transactions.pending} = 0 THEN abs(${transactions.normalizedAmount}) ELSE 0 END), 0)`,
      totalIncome: sql<number>`coalesce(sum(CASE WHEN ${transactions.normalizedAmount} > 0 AND ${transactions.isTransfer} = 0 AND ${transactions.pending} = 0 THEN ${transactions.normalizedAmount} ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(base.scoped.where(transactions, ...conditions))
    .get();

  const count = result?.count ?? 0;
  const totalExpense = result?.totalExpense ?? 0;
  const totalIncome = result?.totalIncome ?? 0;

  return {
    count,
    totalExpense,
    totalIncome,
    net: totalIncome - totalExpense,
  };
}

export function getTransactionDetail(
  householdId: string,
  transactionId: string,
  db: LedgrDb = defaultDb,
): TransactionDetail | null {
  const base = baseTransactionQuery(db, householdId);
  const row = base
    .joins(db.select(base.select).from(base.from))
    .where(
      base.scoped.where(
        transactions,
        eq(transactions.id, transactionId),
        isNull(transactions.deletedAt),
      ),
    )
    .get();

  if (!row) return null;

  const splits = db
    .select({
      id: transactionSplits.id,
      categoryId: transactionSplits.categoryId,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      amount: transactionSplits.amount,
      notes: transactionSplits.notes,
    })
    .from(transactionSplits)
    .leftJoin(categories, eq(transactionSplits.categoryId, categories.id))
    .where(eq(transactionSplits.transactionId, transactionId))
    .all();

  return {
    ...row,
    accountName: row.accountName ?? "",
    currency: row.currency ?? "USD",
    pending: Boolean(row.pending),
    reviewed: Boolean(row.reviewed),
    isTransfer: Boolean(row.isTransfer),
    transferPairId: row.transferPairId ?? null,
    categorySource: row.categorySource ?? null,
    plaidTransactionId: row.plaidTransactionId ?? null,
    hasSplits: splits.length > 0,
    splits,
  };
}
