import { eq, isNull, or, sql, notInArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { LedgrDb } from "@/db";
import { transactions, categories } from "@/db/schema";

export async function getIncomeCategoryIds(db: LedgrDb): Promise<Set<string>> {
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.isIncome, true));
  return new Set(rows.map((r) => r.id));
}

export async function notIncome(db: LedgrDb): Promise<SQL> {
  const ids = [...(await getIncomeCategoryIds(db))];
  if (ids.length === 0) return sql`1=1`;
  return or(
    isNull(transactions.categoryId),
    notInArray(transactions.categoryId, ids),
  )!;
}
