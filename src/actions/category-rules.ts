"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { db as defaultDb, type LedgrDb } from "@/db";
import { categoryRules, categories } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { authorizeAction } from "@/lib/auth/authorize-action";

type ActionResult = { success: true } | { error: string };

// The engine matches with `target.includes(pattern)`, so an empty pattern is
// true for every transaction and one blank rule would swallow the entire feed.
// Trim first, then require something left over.
const ruleInputSchema = z.object({
  categoryId: z.string().min(1),
  matchField: z.enum(["name", "merchant"]),
  matchPattern: z.string().transform((s) => s.trim()).pipe(z.string().min(1).max(200)),
  priority: z.number().int().min(0).max(999),
});

export type CategoryRuleInput = z.input<typeof ruleInputSchema>;

const updateInputSchema = ruleInputSchema.extend({ id: z.string().min(1) });
export type CategoryRuleUpdateInput = z.input<typeof updateInputSchema>;

/**
 * A rule points at a category, so the category must belong to the same
 * household. Without this check a caller could aim a rule at another
 * household's category id and read its name back off the rules list.
 */
async function categoryBelongsToHousehold(
  householdId: string,
  categoryId: string,
  db: LedgrDb,
): Promise<boolean> {
  const scoped = scopedQuery(householdId, db);
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(scoped.where(categories, eq(categories.id, categoryId)))
    .limit(1);
  return !!row;
}

export async function createCategoryRuleScoped(
  householdId: string,
  input: CategoryRuleInput,
  db: LedgrDb = defaultDb,
): Promise<ActionResult> {
  const parsed = ruleInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Enter a pattern to match on." };

  if (!(await categoryBelongsToHousehold(householdId, parsed.data.categoryId, db))) {
    return { error: "Category not found" };
  }

  await db.insert(categoryRules).values({
    id: uuid(),
    householdId,
    categoryId: parsed.data.categoryId,
    matchField: parsed.data.matchField,
    matchPattern: parsed.data.matchPattern,
    priority: parsed.data.priority,
  });

  revalidatePath("/settings/rules");
  return { success: true };
}

export async function createCategoryRule(
  input: CategoryRuleInput,
  db: LedgrDb = defaultDb,
): Promise<ActionResult> {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;
  return createCategoryRuleScoped(auth.householdId, input, db);
}

export async function updateCategoryRuleScoped(
  householdId: string,
  input: CategoryRuleUpdateInput,
  db: LedgrDb = defaultDb,
): Promise<ActionResult> {
  const parsed = updateInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Enter a pattern to match on." };

  if (!(await categoryBelongsToHousehold(householdId, parsed.data.categoryId, db))) {
    return { error: "Category not found" };
  }

  const scoped = scopedQuery(householdId, db);
  const updated = await db
    .update(categoryRules)
    .set({
      categoryId: parsed.data.categoryId,
      matchField: parsed.data.matchField,
      matchPattern: parsed.data.matchPattern,
      priority: parsed.data.priority,
    })
    .where(scoped.where(categoryRules, eq(categoryRules.id, parsed.data.id)))
    .returning({ id: categoryRules.id });

  if (updated.length === 0) return { error: "Rule not found" };

  revalidatePath("/settings/rules");
  return { success: true };
}

export async function updateCategoryRule(
  input: CategoryRuleUpdateInput,
  db: LedgrDb = defaultDb,
): Promise<ActionResult> {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;
  return updateCategoryRuleScoped(auth.householdId, input, db);
}

export async function deleteCategoryRuleScoped(
  householdId: string,
  ruleId: string,
  db: LedgrDb = defaultDb,
): Promise<ActionResult> {
  const parsed = z.string().min(1).safeParse(ruleId);
  if (!parsed.success) return { error: "Invalid input" };

  const scoped = scopedQuery(householdId, db);
  const deleted = await db
    .delete(categoryRules)
    .where(scoped.where(categoryRules, eq(categoryRules.id, parsed.data)))
    .returning({ id: categoryRules.id });

  if (deleted.length === 0) return { error: "Rule not found" };

  revalidatePath("/settings/rules");
  return { success: true };
}

export async function deleteCategoryRule(
  ruleId: string,
  db: LedgrDb = defaultDb,
): Promise<ActionResult> {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;
  return deleteCategoryRuleScoped(auth.householdId, ruleId, db);
}
