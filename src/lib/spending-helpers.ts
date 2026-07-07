import { eq, lt, gte, lte, inArray, notInArray, isNull } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  transactions,
  transactionSplits,
  categories,
  categoryGroups,
} from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted, sumAbs, sumCol } from "@/lib/query-helpers";
import { UNCATEGORIZED, resolvedCategoryLabel } from "@/lib/labels";
import { notIncome } from "@/queries/shared-conditions";
import type { ReportFilters } from "@/queries/reports";

export interface SpendingChartItem {
  id: string | null;
  name: string;
  value: number;
  groupName: string | null;
  groupId: string | null;
  groupIcon: string | null;
  categoryIcon: string | null;
}


async function spendingBaseConditions(filters: ReportFilters, db: LedgrDb) {
  const conditions = [
    notDeleted(transactions),
    lt(transactions.normalizedAmount, 0),
    eq(transactions.pending, false),
    eq(transactions.isTransfer, false),
    isNull(transactions.transferPairId),
    gte(transactions.date, filters.dateFrom),
    lte(transactions.date, filters.dateTo),
    await notIncome(db),
  ];
  if (filters.accountIds?.length) {
    conditions.push(inArray(transactions.accountId, filters.accountIds));
  }
  return conditions;
}


async function findSplitParentIds(
  scoped: ReturnType<typeof scopedQuery>,
  conditions: Awaited<ReturnType<typeof spendingBaseConditions>>,
  db: LedgrDb,
): Promise<string[]> {
  const rows = await db
    .select({ transactionId: transactionSplits.transactionId })
    .from(transactionSplits)
    .innerJoin(transactions, eq(transactionSplits.transactionId, transactions.id))
    .where(scoped.where(transactions, ...conditions))
    .groupBy(transactionSplits.transactionId);
  return rows.map((r) => r.transactionId);
}


export async function aggregateSpending(
  householdId: string,
  filters: ReportFilters,
  db: LedgrDb = defaultDb,
): Promise<Map<string, number>> {
  const scoped = scopedQuery(householdId, db);
  const conditions = await spendingBaseConditions(filters, db);

  const splitParentIds = await findSplitParentIds(scoped, conditions, db);

  // Non-split transactions
  const nonSplitConditions =
    splitParentIds.length > 0
      ? [...conditions, notInArray(transactions.id, splitParentIds)]
      : conditions;

  const nonSplitRows = await db
    .select({
      categoryId: transactions.categoryId,
      total: sumAbs(transactions.normalizedAmount),
    })
    .from(transactions)
    .where(scoped.where(transactions, ...nonSplitConditions))
    .groupBy(transactions.categoryId);

  const spending = new Map<string, number>();
  for (const row of nonSplitRows) {
    const key = row.categoryId ?? "uncategorized";
    spending.set(key, (spending.get(key) ?? 0) + row.total);
  }

  // Split transactions
  if (splitParentIds.length > 0) {
    const splitRows = await db
      .select({
        categoryId: transactionSplits.categoryId,
        total: sumCol(transactionSplits.amount),
      })
      .from(transactionSplits)
      .where(inArray(transactionSplits.transactionId, splitParentIds))
      .groupBy(transactionSplits.categoryId);

    for (const row of splitRows) {
      spending.set(row.categoryId, (spending.get(row.categoryId) ?? 0) + row.total);
    }
  }

  return spending;
}

export async function enrichSpendingMap(
  spending: Map<string, number>,
  db: LedgrDb = defaultDb,
): Promise<SpendingChartItem[]> {
  const categoryIds = [...spending.keys()].filter((k) => k !== "uncategorized");

  type CatRow = {
    id: string;
    name: string;
    groupName: string | null;
    groupId: string | null;
    groupIcon: string | null;
    categoryIcon: string | null;
  };
  let catRows: CatRow[] = [];
  if (categoryIds.length > 0) {
    catRows = await db
      .select({
        id: categories.id,
        name: categories.name,
        groupName: categoryGroups.name,
        groupId: categoryGroups.id,
        groupIcon: categoryGroups.icon,
        categoryIcon: categories.icon,
      })
      .from(categories)
      .leftJoin(categoryGroups, eq(categories.groupId, categoryGroups.id))
      .where(inArray(categories.id, categoryIds));
  }

  const catMap = new Map(catRows.map((c) => [c.id, c]));
  const result: SpendingChartItem[] = [];

  for (const [key, value] of spending.entries()) {
    if (key === "uncategorized") {
      result.push({
        id: null,
        name: UNCATEGORIZED,
        value,
        groupName: null,
        groupId: null,
        groupIcon: null,
        categoryIcon: null,
      });
    } else {
      const cat = catMap.get(key);
      result.push({
        id: key,
        name: resolvedCategoryLabel(cat?.name),
        value,
        groupName: cat?.groupName ?? null,
        groupId: cat?.groupId ?? null,
        groupIcon: cat?.groupIcon ?? null,
        categoryIcon: cat?.categoryIcon ?? null,
      });
    }
  }

  return result.sort((a, b) => b.value - a.value);
}
