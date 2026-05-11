import { eq, lt, gte, lte, inArray, notInArray, isNull, sql } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  transactions,
  transactionSplits,
  categories,
  categoryGroups,
} from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";
import { notIncome } from "@/queries/shared-conditions";
import type { ReportFilters } from "@/queries/reports";

export interface SpendingChartItem {
  id: string | null;
  name: string;
  value: number;
  groupName: string | null;
  groupId: string | null;
}


export function spendingBaseConditions(filters: ReportFilters, db: LedgrDb) {
  const conditions = [
    notDeleted(transactions),
    lt(transactions.normalizedAmount, 0),
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


export function findSplitParentIds(
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


export function aggregateSpending(
  householdId: string,
  filters: ReportFilters,
  db: LedgrDb = defaultDb,
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
      total: sql<number>`COALESCE(SUM(ABS(${transactions.normalizedAmount})), 0)`,
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

export function enrichSpendingMap(
  spending: Map<string, number>,
  db: LedgrDb = defaultDb,
): SpendingChartItem[] {
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
  const result: SpendingChartItem[] = [];

  for (const [key, value] of spending.entries()) {
    if (key === "uncategorized") {
      result.push({ id: null, name: "Uncategorized", value, groupName: null, groupId: null });
    } else {
      const cat = catMap.get(key);
      result.push({
        id: key,
        name: cat?.name ?? "Unknown",
        value,
        groupName: cat?.groupName ?? null,
        groupId: cat?.groupId ?? null,
      });
    }
  }

  return result.sort((a, b) => b.value - a.value);
}
