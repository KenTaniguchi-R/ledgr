"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  budgetCategories,
  budgets,
  categories,
  categoryGroups,
  categoryRules,
  merchants,
  recurringTransactions,
  transactionSplits,
  transactions,
} from "@/db/schema";
import { authorizeAction } from "@/lib/auth/authorize-action";
import { scopedQuery } from "@/lib/scoped-query";

type ActionResult = { success: true } | { error: string };
type CreateResult = { success: true; id: string } | { error: string };

const idSchema = z.string().min(1);
const nameSchema = z.string().trim().min(1).max(80);
const categoryInputSchema = z.object({
  groupId: idSchema,
  name: nameSchema,
  isIncome: z.boolean().default(false),
  includeTransferInSpending: z.boolean().default(false),
});

function revalidateCategoryConsumers() {
  for (const path of ["/categories", "/transactions", "/rules", "/budgets", "/bills", "/reports"]) {
    revalidatePath(path);
  }
}

async function getOwnedGroup(householdId: string, groupId: string, db: LedgrDb) {
  const scoped = scopedQuery(householdId, db);
  const [group] = await db
    .select({ id: categoryGroups.id, isSystem: categoryGroups.isSystem })
    .from(categoryGroups)
    .where(scoped.where(categoryGroups, eq(categoryGroups.id, groupId)))
    .limit(1);
  return group;
}

async function getOwnedCategory(householdId: string, categoryId: string, db: LedgrDb) {
  const scoped = scopedQuery(householdId, db);
  const [category] = await db
    .select({ id: categories.id, isSystem: categories.isSystem })
    .from(categories)
    .where(scoped.where(categories, eq(categories.id, categoryId)))
    .limit(1);
  return category;
}

export async function createCategoryGroupScoped(
  householdId: string,
  name: string,
  db: LedgrDb = defaultDb,
): Promise<CreateResult> {
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { error: "Enter a group name between 1 and 80 characters." };

  const scoped = scopedQuery(householdId, db);
  const [last] = await db
    .select({ sortOrder: categoryGroups.sortOrder })
    .from(categoryGroups)
    .where(scoped.where(categoryGroups))
    .orderBy(desc(categoryGroups.sortOrder))
    .limit(1);

  const id = uuid();
  await db.insert(categoryGroups).values({
    id,
    householdId,
    name: parsed.data,
    isSystem: false,
    sortOrder: (last?.sortOrder ?? -1) + 1,
  });

  revalidateCategoryConsumers();
  return { success: true, id };
}

export async function createCategoryGroup(
  name: string,
  db: LedgrDb = defaultDb,
): Promise<CreateResult> {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;
  return createCategoryGroupScoped(auth.householdId, name, db);
}

export async function createCategoryScoped(
  householdId: string,
  input: z.input<typeof categoryInputSchema>,
  db: LedgrDb = defaultDb,
): Promise<CreateResult> {
  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Enter a valid category name and group." };

  const group = await getOwnedGroup(householdId, parsed.data.groupId, db);
  if (!group) return { error: "Category group not found." };

  const scoped = scopedQuery(householdId, db);
  const [last] = await db
    .select({ sortOrder: categories.sortOrder })
    .from(categories)
    .where(scoped.where(categories, eq(categories.groupId, parsed.data.groupId)))
    .orderBy(desc(categories.sortOrder))
    .limit(1);

  const id = uuid();
  await db.insert(categories).values({
    id,
    householdId,
    groupId: parsed.data.groupId,
    name: parsed.data.name,
    isIncome: parsed.data.isIncome,
    includeTransferInSpending: parsed.data.includeTransferInSpending,
    isSystem: false,
    sortOrder: (last?.sortOrder ?? -1) + 1,
  });

  revalidateCategoryConsumers();
  return { success: true, id };
}

export async function createCategory(
  input: z.input<typeof categoryInputSchema>,
  db: LedgrDb = defaultDb,
): Promise<CreateResult> {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;
  return createCategoryScoped(auth.householdId, input, db);
}

export async function renameCategoryGroupScoped(
  householdId: string,
  groupId: string,
  name: string,
  db: LedgrDb = defaultDb,
): Promise<ActionResult> {
  const parsedId = idSchema.safeParse(groupId);
  const parsedName = nameSchema.safeParse(name);
  if (!parsedId.success || !parsedName.success) return { error: "Invalid input." };

  const scoped = scopedQuery(householdId, db);
  const updated = await db
    .update(categoryGroups)
    .set({ name: parsedName.data })
    .where(
      scoped.where(
        categoryGroups,
        eq(categoryGroups.id, parsedId.data),
        eq(categoryGroups.isSystem, false),
      ),
    )
    .returning({ id: categoryGroups.id });

  if (updated.length === 0) return { error: "Only custom category groups can be renamed." };
  revalidateCategoryConsumers();
  return { success: true };
}

export async function renameCategoryGroup(
  groupId: string,
  name: string,
  db: LedgrDb = defaultDb,
): Promise<ActionResult> {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;
  return renameCategoryGroupScoped(auth.householdId, groupId, name, db);
}

export async function renameCategoryScoped(
  householdId: string,
  categoryId: string,
  name: string,
  db: LedgrDb = defaultDb,
): Promise<ActionResult> {
  const parsedId = idSchema.safeParse(categoryId);
  const parsedName = nameSchema.safeParse(name);
  if (!parsedId.success || !parsedName.success) return { error: "Invalid input." };

  const scoped = scopedQuery(householdId, db);
  const updated = await db
    .update(categories)
    .set({ name: parsedName.data })
    .where(
      scoped.where(
        categories,
        eq(categories.id, parsedId.data),
        eq(categories.isSystem, false),
      ),
    )
    .returning({ id: categories.id });

  if (updated.length === 0) return { error: "Only custom categories can be renamed." };
  revalidateCategoryConsumers();
  return { success: true };
}

export async function renameCategory(
  categoryId: string,
  name: string,
  db: LedgrDb = defaultDb,
): Promise<ActionResult> {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;
  return renameCategoryScoped(auth.householdId, categoryId, name, db);
}

export async function updateCategoryReportingScoped(
  householdId: string,
  categoryId: string,
  includeTransferInSpending: boolean,
  db: LedgrDb = defaultDb,
): Promise<ActionResult> {
  const parsedId = idSchema.safeParse(categoryId);
  if (!parsedId.success) return { error: "Invalid input." };

  const scoped = scopedQuery(householdId, db);
  const updated = await db
    .update(categories)
    .set({ includeTransferInSpending })
    .where(
      scoped.where(
        categories,
        eq(categories.id, parsedId.data),
        eq(categories.isSystem, false),
      ),
    )
    .returning({ id: categories.id });

  if (updated.length === 0) return { error: "Only custom categories can be changed." };
  revalidateCategoryConsumers();
  return { success: true };
}

export async function updateCategoryReporting(
  categoryId: string,
  includeTransferInSpending: boolean,
  db: LedgrDb = defaultDb,
): Promise<ActionResult> {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;
  return updateCategoryReportingScoped(
    auth.householdId,
    categoryId,
    includeTransferInSpending,
    db,
  );
}

async function categoryHasDependencies(
  householdId: string,
  categoryId: string,
  db: LedgrDb,
): Promise<boolean> {
  const scoped = scopedQuery(householdId, db);

  const [transaction, split, rule, merchant, budget, recurring] = await Promise.all([
    db
      .select({ id: transactions.id })
      .from(transactions)
      .where(scoped.where(transactions, eq(transactions.categoryId, categoryId)))
      .limit(1),
    db
      .select({ id: transactionSplits.id })
      .from(transactionSplits)
      .innerJoin(transactions, eq(transactionSplits.transactionId, transactions.id))
      .where(scoped.where(transactions, eq(transactionSplits.categoryId, categoryId)))
      .limit(1),
    db
      .select({ id: categoryRules.id })
      .from(categoryRules)
      .where(scoped.where(categoryRules, eq(categoryRules.categoryId, categoryId)))
      .limit(1),
    db
      .select({ id: merchants.id })
      .from(merchants)
      .where(scoped.where(merchants, eq(merchants.categoryId, categoryId)))
      .limit(1),
    db
      .select({ id: budgetCategories.id })
      .from(budgetCategories)
      .innerJoin(budgets, eq(budgetCategories.budgetId, budgets.id))
      .where(scoped.where(budgets, eq(budgetCategories.categoryId, categoryId)))
      .limit(1),
    db
      .select({ id: recurringTransactions.id })
      .from(recurringTransactions)
      .where(scoped.where(recurringTransactions, eq(recurringTransactions.categoryId, categoryId)))
      .limit(1),
  ]);

  return [transaction, split, rule, merchant, budget, recurring].some((rows) => rows.length > 0);
}

export async function deleteCategoryScoped(
  householdId: string,
  categoryId: string,
  db: LedgrDb = defaultDb,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse(categoryId);
  if (!parsed.success) return { error: "Invalid input." };

  const category = await getOwnedCategory(householdId, parsed.data, db);
  if (!category) return { error: "Category not found." };
  if (category.isSystem) return { error: "System categories cannot be deleted." };
  if (await categoryHasDependencies(householdId, parsed.data, db)) {
    return { error: "This category is in use and cannot be deleted." };
  }

  const scoped = scopedQuery(householdId, db);
  await db
    .delete(categories)
    .where(scoped.where(categories, eq(categories.id, parsed.data), eq(categories.isSystem, false)));

  revalidateCategoryConsumers();
  return { success: true };
}

export async function deleteCategory(
  categoryId: string,
  db: LedgrDb = defaultDb,
): Promise<ActionResult> {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;
  return deleteCategoryScoped(auth.householdId, categoryId, db);
}

export async function deleteCategoryGroupScoped(
  householdId: string,
  groupId: string,
  db: LedgrDb = defaultDb,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse(groupId);
  if (!parsed.success) return { error: "Invalid input." };

  const group = await getOwnedGroup(householdId, parsed.data, db);
  if (!group) return { error: "Category group not found." };
  if (group.isSystem) return { error: "System category groups cannot be deleted." };

  const scoped = scopedQuery(householdId, db);
  const [child] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(scoped.where(categories, eq(categories.groupId, parsed.data)))
    .limit(1);
  if (child) return { error: "Delete or move the categories in this group first." };

  await db
    .delete(categoryGroups)
    .where(
      scoped.where(
        categoryGroups,
        eq(categoryGroups.id, parsed.data),
        eq(categoryGroups.isSystem, false),
      ),
    );

  revalidateCategoryConsumers();
  return { success: true };
}

export async function deleteCategoryGroup(
  groupId: string,
  db: LedgrDb = defaultDb,
): Promise<ActionResult> {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;
  return deleteCategoryGroupScoped(auth.householdId, groupId, db);
}
