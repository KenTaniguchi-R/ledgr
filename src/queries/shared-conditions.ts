import { cache } from "react";
import { eq, isNull, or, sql, notInArray } from "drizzle-orm";
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
