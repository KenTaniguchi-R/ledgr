import { eq, isNull, or, sql, notInArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { LedgrDb } from "@/db";
import { transactions, categories } from "@/db/schema";

export function getIncomeCategoryIds(db: LedgrDb): Set<string> {
  const ids = db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.isIncome, true))
    .all()
    .map((r) => r.id);
  return new Set(ids);
}

export function notIncome(db: LedgrDb): SQL {
  const ids = [...getIncomeCategoryIds(db)];
  if (ids.length === 0) return sql`1=1`;
  return or(
    isNull(transactions.categoryId),
    notInArray(transactions.categoryId, ids),
  )!;
}
