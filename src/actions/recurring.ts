"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db as defaultDb, type LedgrDb } from "@/db";
import { recurringTransactions, categories } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { authorizeAction } from "@/lib/auth/authorize-action";

type ActionResult = { success: true } | { error: string };

const FREQUENCIES = ["weekly", "biweekly", "semimonthly", "monthly", "yearly"] as const;

const updateSchema = z.object({
  id: z.string().min(1),
  name: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1).max(200)),
  // Null clears the category. A bill with no category is a normal state --
  // every detected bill starts that way.
  categoryId: z.string().min(1).nullable(),
  // Amounts are displayed via Math.abs, so a negative would render identically
  // while corrupting the sign handling behind the monthly total.
  averageAmount: z.number().int().min(0),
  frequency: z.enum(FREQUENCIES),
  isActive: z.boolean(),
});

export type RecurringUpdateInput = z.input<typeof updateSchema>;

/**
 * A bill points at a category, so the category must belong to the same
 * household -- otherwise a caller could aim a bill at another household's
 * category id and read its name back off the bills list.
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

export async function updateRecurringTransactionScoped(
  householdId: string,
  input: RecurringUpdateInput,
  db: LedgrDb = defaultDb,
): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the name, amount and frequency." };

  if (
    parsed.data.categoryId !== null &&
    !(await categoryBelongsToHousehold(householdId, parsed.data.categoryId, db))
  ) {
    return { error: "Category not found" };
  }

  const scoped = scopedQuery(householdId, db);
  const updated = await db
    .update(recurringTransactions)
    .set({
      name: parsed.data.name,
      categoryId: parsed.data.categoryId,
      averageAmount: parsed.data.averageAmount,
      frequency: parsed.data.frequency,
      // Muting keeps the row: getUpcomingBills and getRecurringSummary both
      // filter on isActive, so the bill leaves the list and the monthly total
      // while the record survives -- otherwise the next sync would re-detect
      // it as new and the user would have to mute it again.
      isActive: parsed.data.isActive,
      updatedAt: new Date(),
    })
    .where(scoped.where(recurringTransactions, eq(recurringTransactions.id, parsed.data.id)))
    .returning({ id: recurringTransactions.id });

  if (updated.length === 0) return { error: "Bill not found" };

  revalidatePath("/bills");
  revalidatePath("/");
  return { success: true };
}

export async function updateRecurringTransaction(
  input: RecurringUpdateInput,
  db: LedgrDb = defaultDb,
): Promise<ActionResult> {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;
  return updateRecurringTransactionScoped(auth.householdId, input, db);
}

export async function deleteRecurringTransactionScoped(
  householdId: string,
  billId: string,
  db: LedgrDb = defaultDb,
): Promise<ActionResult> {
  const parsed = z.string().min(1).safeParse(billId);
  if (!parsed.success) return { error: "Invalid input" };

  const scoped = scopedQuery(householdId, db);
  const deleted = await db
    .delete(recurringTransactions)
    .where(scoped.where(recurringTransactions, eq(recurringTransactions.id, parsed.data)))
    .returning({ id: recurringTransactions.id });

  if (deleted.length === 0) return { error: "Bill not found" };

  revalidatePath("/bills");
  revalidatePath("/");
  return { success: true };
}

export async function deleteRecurringTransaction(
  billId: string,
  db: LedgrDb = defaultDb,
): Promise<ActionResult> {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;
  return deleteRecurringTransactionScoped(auth.householdId, billId, db);
}
