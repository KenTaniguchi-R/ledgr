import { cache } from "react";
import { and, eq, inArray, isNull, lt, or, sql, notInArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { LedgrDb } from "@/db";
import { transactions, categories } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";

export const getIncomeCategoryIds = cache(
  async (householdId: string, db: LedgrDb): Promise<Set<string>> => {
    const scoped = scopedQuery(householdId, db);
    const rows = await db
      .select({ id: categories.id })
      .from(categories)
      .where(scoped.where(categories, eq(categories.isIncome, true)));
    return new Set(rows.map((r) => r.id));
  },
);

export async function notIncome(householdId: string, db: LedgrDb): Promise<SQL> {
  const ids = [...(await getIncomeCategoryIds(householdId, db))];
  if (ids.length === 0) return sql`1=1`;
  return or(
    isNull(transactions.categoryId),
    notInArray(transactions.categoryId, ids),
  )!;
}

const getTransferReportingCategoryIds = cache(
  async (householdId: string, db: LedgrDb): Promise<string[]> => {
    const scoped = scopedQuery(householdId, db);
    const rows = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        scoped.where(
          categories,
          eq(categories.includeTransferInSpending, true),
          eq(categories.isIncome, false),
        ),
      );
    return rows.map((row) => row.id);
  },
);

/**
 * Preserve the normal transfer exclusion, but allow a negative transaction in
 * an explicitly opted-in category through even when it has a transfer pair.
 */
export async function includedInSpending(householdId: string, db: LedgrDb): Promise<SQL> {
  const categoryIds = await getTransferReportingCategoryIds(householdId, db);
  const ordinaryTransaction = and(
    eq(transactions.isTransfer, false),
    isNull(transactions.transferPairId),
  )!;

  if (categoryIds.length === 0) return ordinaryTransaction;

  return or(
    ordinaryTransaction,
    and(
      eq(transactions.isTransfer, true),
      lt(transactions.normalizedAmount, 0),
      inArray(transactions.categoryId, categoryIds),
    ),
  )!;
}


const getCashFlowTransferCategoryIds = cache(
  async (householdId: string, db: LedgrDb): Promise<string[]> => {
    const scoped = scopedQuery(householdId, db);
    const rows = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        scoped.where(
          categories,
          eq(categories.includeTransferInCashFlow, true),
          eq(categories.isIncome, false),
        ),
      );
    return rows.map((row) => row.id);
  },
);

/** Cash Flow transfer inclusion, independent from spending reporting. */
export async function includedInCashFlow(householdId: string, db: LedgrDb): Promise<SQL> {
  const categoryIds = await getCashFlowTransferCategoryIds(householdId, db);
  const ordinaryTransaction = and(
    eq(transactions.isTransfer, false),
    isNull(transactions.transferPairId),
  )!;

  if (categoryIds.length === 0) return ordinaryTransaction;

  return or(
    ordinaryTransaction,
    and(
      eq(transactions.isTransfer, true),
      lt(transactions.normalizedAmount, 0),
      inArray(transactions.categoryId, categoryIds),
    ),
  )!;
}
