import { desc, eq } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { categoryRules, categories } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";

export interface CategoryRuleRow {
  id: string;
  categoryId: string;
  categoryName: string;
  matchField: "name" | "merchant";
  matchPattern: string;
  priority: number;
}

/**
 * Rules for the management page, in the order the categorization engine
 * evaluates them.
 *
 * The engine sorts by priority descending and stops at the first match
 * (`categorizeTransactions`, `lib/categorization/engine.ts`), so listing them
 * in any other order would misrepresent which rule actually wins.
 */
export async function getCategoryRules(
  householdId: string,
  db: LedgrDb = defaultDb,
): Promise<CategoryRuleRow[]> {
  const scoped = scopedQuery(householdId, db);

  const rows = await db
    .select({
      id: categoryRules.id,
      categoryId: categoryRules.categoryId,
      categoryName: categories.name,
      matchField: categoryRules.matchField,
      matchPattern: categoryRules.matchPattern,
      priority: categoryRules.priority,
    })
    .from(categoryRules)
    .innerJoin(categories, eq(categories.id, categoryRules.categoryId))
    .where(scoped.where(categoryRules))
    .orderBy(desc(categoryRules.priority), categoryRules.matchPattern);

  return rows.map((r) => ({
    id: r.id,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    matchField: (r.matchField ?? "name") as "name" | "merchant",
    matchPattern: r.matchPattern,
    priority: r.priority ?? 0,
  }));
}
