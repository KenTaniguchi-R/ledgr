"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { db as defaultDb, type LedgrDb } from "@/db";
import { budgets, budgetCategories } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { authorizeAction } from "@/lib/auth/authorize-action";

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);
const budgetTypeSchema = z.enum(["category", "flex"]);

async function verifyBudgetOwnership(
  budgetId: string,
  householdId: string,
  db: LedgrDb,
) {
  const scoped = scopedQuery(householdId, db);
  const [row] = await db
    .select({ id: budgets.id })
    .from(budgets)
    .where(scoped.where(budgets, eq(budgets.id, budgetId)))
    .limit(1);
  return row;
}

export async function createBudget(
  month: string,
  db: LedgrDb = defaultDb,
): Promise<{ success: true; budgetId: string } | { error: string }> {
  const parsed = monthSchema.safeParse(month);
  if (!parsed.success) {
    return { error: "Invalid month format. Use YYYY-MM." };
  }

  const auth = await authorizeAction();
  if ("error" in auth) return auth;
  const { householdId } = auth;

  const scoped = scopedQuery(householdId, db);

  // Idempotent: return existing budget if one exists for this household+month
  const [existing] = await db
    .select({ id: budgets.id })
    .from(budgets)
    .where(scoped.where(budgets, eq(budgets.month, month)))
    .limit(1);

  if (existing) {
    return { success: true, budgetId: existing.id };
  }

  const id = uuid();
  const now = new Date();
  await db.insert(budgets)
    .values({
      id,
      householdId,
      month,
      createdAt: now,
      updatedAt: now,
    });

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

  const auth = await authorizeAction();
  if ("error" in auth) return auth;
  const { householdId } = auth;

  const owned = await verifyBudgetOwnership(budgetId, householdId, db);
  if (!owned) {
    return { error: "Budget not found" };
  }

  // Upsert: check if row exists
  const [existing] = await db
    .select({ id: budgetCategories.id })
    .from(budgetCategories)
    .where(
      and(
        eq(budgetCategories.budgetId, budgetId),
        eq(budgetCategories.categoryId, categoryId),
      ),
    )
    .limit(1);

  if (existing) {
    await db.update(budgetCategories)
      .set({ limitAmount })
      .where(eq(budgetCategories.id, existing.id));
  } else {
    await db.insert(budgetCategories)
      .values({
        id: uuid(),
        budgetId,
        categoryId,
        limitAmount,
      });
  }

  revalidatePath("/budgets");
  return { success: true };
}

export async function removeBudgetCategory(
  budgetId: string,
  categoryId: string,
  db: LedgrDb = defaultDb,
): Promise<{ success: true } | { error: string }> {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;
  const { householdId } = auth;

  const owned = await verifyBudgetOwnership(budgetId, householdId, db);
  if (!owned) {
    return { error: "Budget not found" };
  }

  await db.delete(budgetCategories)
    .where(
      and(
        eq(budgetCategories.budgetId, budgetId),
        eq(budgetCategories.categoryId, categoryId),
      ),
    );

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

  const auth = await authorizeAction();
  if ("error" in auth) return auth;
  const { householdId } = auth;

  const scoped = scopedQuery(householdId, db);

  // Find source budget
  const [sourceBudget] = await db
    .select({ id: budgets.id })
    .from(budgets)
    .where(scoped.where(budgets, eq(budgets.month, sourceMonth)))
    .limit(1);

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
  const sourceCategories = await db
    .select()
    .from(budgetCategories)
    .where(eq(budgetCategories.budgetId, sourceBudget.id));

  // Get existing target categories to avoid overwriting
  const existingTargetCategories = await db
    .select({ categoryId: budgetCategories.categoryId })
    .from(budgetCategories)
    .where(eq(budgetCategories.budgetId, targetBudgetId));
  const existingCategoryIds = new Set(existingTargetCategories.map((r) => r.categoryId));

  // Copy only missing categories
  for (const src of sourceCategories) {
    if (!existingCategoryIds.has(src.categoryId)) {
      await db.insert(budgetCategories)
        .values({
          id: uuid(),
          budgetId: targetBudgetId,
          categoryId: src.categoryId,
          limitAmount: src.limitAmount,
          rollover: src.rollover,
          isFixed: src.isFixed,
        });
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

  const auth = await authorizeAction();
  if ("error" in auth) return auth;
  const { householdId } = auth;

  const owned = await verifyBudgetOwnership(budgetId, householdId, db);
  if (!owned) {
    return { error: "Budget not found" };
  }

  await db.update(budgets)
    .set({ type: parsedType.data, updatedAt: new Date() })
    .where(eq(budgets.id, budgetId));

  revalidatePath("/budgets");
  return { success: true };
}
