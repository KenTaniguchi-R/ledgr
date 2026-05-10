"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { db as defaultDb, type LedgrDb } from "@/db";
import { budgets, budgetCategories } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { getHouseholdId } from "@/lib/auth/session";

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);
const budgetTypeSchema = z.enum(["category", "flex"]);

function verifyBudgetOwnership(
  budgetId: string,
  householdId: string,
  db: LedgrDb,
) {
  const scoped = scopedQuery(householdId, db);
  return db
    .select({ id: budgets.id })
    .from(budgets)
    .where(scoped.where(budgets, eq(budgets.id, budgetId)))
    .get();
}

export async function createBudget(
  month: string,
  db: LedgrDb = defaultDb,
): Promise<{ success: true; budgetId: string } | { error: string }> {
  const parsed = monthSchema.safeParse(month);
  if (!parsed.success) {
    return { error: "Invalid month format. Use YYYY-MM." };
  }

  const householdId = await getHouseholdId();
  const scoped = scopedQuery(householdId, db);

  // Idempotent: return existing budget if one exists for this household+month
  const existing = db
    .select({ id: budgets.id })
    .from(budgets)
    .where(scoped.where(budgets, eq(budgets.month, month)))
    .get();

  if (existing) {
    return { success: true, budgetId: existing.id };
  }

  const id = uuid();
  const now = new Date().toISOString();
  db.insert(budgets)
    .values({
      id,
      householdId,
      month,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  revalidatePath("/budgets");
  return { success: true, budgetId: id };
}

export async function setBudgetCategory(
  budgetId: string,
  categoryId: string,
  limitAmount: number,
  db: LedgrDb = defaultDb,
): Promise<{ success: true } | { error: string }> {
  const parsedBudgetId = z.string().min(1).safeParse(budgetId);
  const parsedCategoryId = z.string().min(1).safeParse(categoryId);
  const parsedLimit = z.number().int().min(0).safeParse(limitAmount);
  if (!parsedBudgetId.success || !parsedCategoryId.success || !parsedLimit.success) {
    return { error: "Invalid input" };
  }

  const householdId = await getHouseholdId();
  const owned = verifyBudgetOwnership(budgetId, householdId, db);
  if (!owned) {
    return { error: "Budget not found" };
  }

  // Upsert: check if row exists
  const existing = db
    .select({ id: budgetCategories.id })
    .from(budgetCategories)
    .where(
      and(
        eq(budgetCategories.budgetId, budgetId),
        eq(budgetCategories.categoryId, categoryId),
      ),
    )
    .get();

  if (existing) {
    db.update(budgetCategories)
      .set({ limitAmount })
      .where(eq(budgetCategories.id, existing.id))
      .run();
  } else {
    db.insert(budgetCategories)
      .values({
        id: uuid(),
        budgetId,
        categoryId,
        limitAmount,
      })
      .run();
  }

  revalidatePath("/budgets");
  return { success: true };
}

export async function removeBudgetCategory(
  budgetId: string,
  categoryId: string,
  db: LedgrDb = defaultDb,
): Promise<{ success: true } | { error: string }> {
  const householdId = await getHouseholdId();
  const owned = verifyBudgetOwnership(budgetId, householdId, db);
  if (!owned) {
    return { error: "Budget not found" };
  }

  db.delete(budgetCategories)
    .where(
      and(
        eq(budgetCategories.budgetId, budgetId),
        eq(budgetCategories.categoryId, categoryId),
      ),
    )
    .run();

  revalidatePath("/budgets");
  return { success: true };
}

export async function copyBudgetFromMonth(
  sourceMonth: string,
  targetMonth: string,
  db: LedgrDb = defaultDb,
): Promise<{ success: true; budgetId: string } | { error: string }> {
  const parsedSource = monthSchema.safeParse(sourceMonth);
  const parsedTarget = monthSchema.safeParse(targetMonth);
  if (!parsedSource.success || !parsedTarget.success) {
    return { error: "Invalid month format. Use YYYY-MM." };
  }

  const householdId = await getHouseholdId();
  const scoped = scopedQuery(householdId, db);

  // Find source budget
  const sourceBudget = db
    .select({ id: budgets.id })
    .from(budgets)
    .where(scoped.where(budgets, eq(budgets.month, sourceMonth)))
    .get();

  if (!sourceBudget) {
    return { error: "Source budget not found" };
  }

  // Create or get target budget (idempotent)
  const targetResult = await createBudget(targetMonth, db);
  if ("error" in targetResult) {
    return targetResult;
  }
  const targetBudgetId = targetResult.budgetId;

  // Get source categories
  const sourceCategories = db
    .select()
    .from(budgetCategories)
    .where(eq(budgetCategories.budgetId, sourceBudget.id))
    .all();

  // Get existing target categories to avoid overwriting
  const existingTargetCategories = db
    .select({ categoryId: budgetCategories.categoryId })
    .from(budgetCategories)
    .where(eq(budgetCategories.budgetId, targetBudgetId))
    .all();
  const existingCategoryIds = new Set(existingTargetCategories.map((r) => r.categoryId));

  // Copy only missing categories
  for (const src of sourceCategories) {
    if (!existingCategoryIds.has(src.categoryId)) {
      db.insert(budgetCategories)
        .values({
          id: uuid(),
          budgetId: targetBudgetId,
          categoryId: src.categoryId,
          limitAmount: src.limitAmount,
          rollover: src.rollover,
          isFixed: src.isFixed,
        })
        .run();
    }
  }

  revalidatePath("/budgets");
  return { success: true, budgetId: targetBudgetId };
}

export async function updateBudgetType(
  budgetId: string,
  type: "category" | "flex",
  db: LedgrDb = defaultDb,
): Promise<{ success: true } | { error: string }> {
  const parsedType = budgetTypeSchema.safeParse(type);
  if (!parsedType.success) {
    return { error: "Invalid budget type" };
  }

  const householdId = await getHouseholdId();
  const owned = verifyBudgetOwnership(budgetId, householdId, db);
  if (!owned) {
    return { error: "Budget not found" };
  }

  db.update(budgets)
    .set({ type: parsedType.data, updatedAt: new Date().toISOString() })
    .where(eq(budgets.id, budgetId))
    .run();

  revalidatePath("/budgets");
  return { success: true };
}

