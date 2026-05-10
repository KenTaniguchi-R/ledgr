"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db as defaultDb, type LedgrDb } from "@/db";
import { transactions } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";
import { getHouseholdId } from "@/lib/auth/session";
import { getTransactions, type TransactionFilters, type TransactionPage } from "@/queries/transactions";

const categoryIdSchema = z.string().min(1).nullable();
const transactionIdSchema = z.string().min(1);
const bulkIdsSchema = z.array(z.string().min(1)).min(1).max(500);

export async function updateTransactionCategory(
  transactionId: string,
  categoryId: string | null,
  db: LedgrDb = defaultDb,
): Promise<{ success: true } | { error: string }> {
  const householdId = await getHouseholdId();
  const parsedTxnId = transactionIdSchema.safeParse(transactionId);
  const parsedCatId = categoryIdSchema.safeParse(categoryId);
  if (!parsedTxnId.success || !parsedCatId.success) {
    return { error: "Invalid input" };
  }

  const scoped = scopedQuery(householdId, db);
  const existing = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(scoped.where(transactions, eq(transactions.id, transactionId), notDeleted(transactions)))
    .get();

  if (!existing) {
    return { error: "Transaction not found" };
  }

  const updates: Partial<typeof transactions.$inferInsert> = {
    categoryId: parsedCatId.data,
    categorySource: parsedCatId.data !== null ? "manual" : null,
    updatedAt: new Date().toISOString(),
  };
  if (parsedCatId.data !== null) {
    updates.reviewed = true;
  }

  db.update(transactions)
    .set(updates)
    .where(eq(transactions.id, existing.id))
    .run();

  return { success: true };
}

export async function toggleReviewed(
  transactionId: string,
  db: LedgrDb = defaultDb,
): Promise<{ success: true; reviewed: boolean } | { error: string }> {
  const householdId = await getHouseholdId();

  const scoped = scopedQuery(householdId, db);
  const existing = db
    .select({ id: transactions.id, reviewed: transactions.reviewed })
    .from(transactions)
    .where(scoped.where(transactions, eq(transactions.id, transactionId), notDeleted(transactions)))
    .get();

  if (!existing) {
    return { error: "Transaction not found" };
  }

  const newReviewed = !existing.reviewed;
  db.update(transactions)
    .set({ reviewed: newReviewed, updatedAt: new Date().toISOString() })
    .where(eq(transactions.id, existing.id))
    .run();

  return { success: true, reviewed: newReviewed };
}

export async function bulkUpdateCategory(
  transactionIds: string[],
  categoryId: string | null,
  db: LedgrDb = defaultDb,
): Promise<{ success: true; updatedCount: number } | { error: string }> {
  const parsedIds = bulkIdsSchema.safeParse(transactionIds);
  if (!parsedIds.success) {
    return { error: "Invalid input: provide 1-500 transaction IDs" };
  }

  const householdId = await getHouseholdId();
  const scoped = scopedQuery(householdId, db);

  const owned = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      scoped.where(
        transactions,
        inArray(transactions.id, parsedIds.data),
        notDeleted(transactions),
      ),
    )
    .all();

  if (owned.length === 0) {
    return { success: true, updatedCount: 0 };
  }

  const ownedIds = owned.map((r) => r.id);
  const updates: Partial<typeof transactions.$inferInsert> = {
    categoryId,
    categorySource: categoryId !== null ? "manual" : null,
    updatedAt: new Date().toISOString(),
  };
  if (categoryId !== null) {
    updates.reviewed = true;
  }

  db.update(transactions)
    .set(updates)
    .where(inArray(transactions.id, ownedIds))
    .run();

  revalidatePath("/transactions");
  return { success: true, updatedCount: ownedIds.length };
}

export async function bulkMarkReviewed(
  transactionIds: string[],
  reviewed: boolean,
  db: LedgrDb = defaultDb,
): Promise<{ success: true; updatedCount: number } | { error: string }> {
  const parsedIds = bulkIdsSchema.safeParse(transactionIds);
  if (!parsedIds.success) {
    return { error: "Invalid input: provide 1-500 transaction IDs" };
  }

  const householdId = await getHouseholdId();
  const scoped = scopedQuery(householdId, db);

  const owned = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      scoped.where(
        transactions,
        inArray(transactions.id, parsedIds.data),
        notDeleted(transactions),
      ),
    )
    .all();

  if (owned.length === 0) {
    return { success: true, updatedCount: 0 };
  }

  const ownedIds = owned.map((r) => r.id);
  db.update(transactions)
    .set({ reviewed, updatedAt: new Date().toISOString() })
    .where(inArray(transactions.id, ownedIds))
    .run();

  revalidatePath("/transactions");
  return { success: true, updatedCount: ownedIds.length };
}

export async function loadMoreTransactions(
  filters: TransactionFilters,
  cursor: string,
  db: LedgrDb = defaultDb,
): Promise<TransactionPage> {
  const householdId = await getHouseholdId();
  return getTransactions(householdId, filters, 50, cursor, db);
}
