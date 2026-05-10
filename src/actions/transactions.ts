"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getHouseholdId } from "@/lib/auth/session";
import { db as defaultDb, type LedgrDb } from "@/db";
import { transactions } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";

export async function updateTransactionCategory(
  transactionId: string,
  categoryId: string | null,
  db: LedgrDb = defaultDb,
) {
  const householdId = await getHouseholdId();
  const scoped = scopedQuery(householdId, db);

  const existing = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(scoped.where(transactions, eq(transactions.id, transactionId)))
    .get();

  if (!existing) {
    return { error: "Transaction not found" };
  }

  db.update(transactions)
    .set({ categoryId })
    .where(scoped.where(transactions, eq(transactions.id, transactionId)))
    .run();

  revalidatePath("/transactions");
  return { success: true };
}

export async function toggleReviewed(
  transactionId: string,
  db: LedgrDb = defaultDb,
) {
  const householdId = await getHouseholdId();
  const scoped = scopedQuery(householdId, db);

  const existing = db
    .select({ reviewed: transactions.reviewed })
    .from(transactions)
    .where(scoped.where(transactions, eq(transactions.id, transactionId)))
    .get();

  if (!existing) {
    return { error: "Transaction not found" };
  }

  const newReviewed = !existing.reviewed;

  db.update(transactions)
    .set({ reviewed: newReviewed })
    .where(scoped.where(transactions, eq(transactions.id, transactionId)))
    .run();

  revalidatePath("/transactions");
  return { success: true };
}
