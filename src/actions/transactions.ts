"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db as defaultDb, type LedgrDb } from "@/db";
import { transactions, merchants } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";
import { authorizeAction } from "@/lib/auth/authorize-action";
import { getHouseholdId } from "@/lib/auth/session";
import { getTransactions, type TransactionFilters, type TransactionPage } from "@/queries/transactions";

const categoryIdSchema = z.string().min(1).nullable();
const transactionIdSchema = z.string().min(1);
const bulkIdsSchema = z.array(z.string().min(1)).min(1).max(500);
const transactionFiltersSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  accountId: z.string().optional(),
  categoryId: z.string().nullable().optional(),
  reviewed: z.boolean().optional(),
  search: z.string().optional(),
  amountMin: z.coerce.number().optional(),
  amountMax: z.coerce.number().optional(),
  transactionType: z.enum(["expense", "credits", "transfer"]).optional(),
});

function buildCategoryUpdate(categoryId: string | null) {
  return {
    categoryId,
    categorySource: categoryId !== null ? ("manual" as const) : null,
    reviewed: categoryId !== null,
    updatedAt: new Date(),
  };
}

export type UpdateTransactionCategoryResult =
  | { success: true; merchantCategoryConflict?: { merchantId: string; currentCategoryId: string } }
  | { error: string };

export async function updateTransactionCategoryScoped(
  householdId: string,
  transactionId: string,
  categoryId: string | null,
  db: LedgrDb = defaultDb,
): Promise<UpdateTransactionCategoryResult> {
  const parsedTxnId = transactionIdSchema.safeParse(transactionId);
  const parsedCatId = categoryIdSchema.safeParse(categoryId);
  if (!parsedTxnId.success || !parsedCatId.success) {
    return { error: "Invalid input" };
  }

  const scoped = scopedQuery(householdId, db);
  const [existing] = await db
    .select({ id: transactions.id, merchantId: transactions.merchantId })
    .from(transactions)
    .where(scoped.where(transactions, eq(transactions.id, transactionId), notDeleted(transactions)))
    .limit(1);

  if (!existing) {
    return { error: "Transaction not found" };
  }

  const updates = buildCategoryUpdate(parsedCatId.data);

  let merchantCategoryConflict: { merchantId: string; currentCategoryId: string } | undefined;

  await db.transaction(async (tx) => {
    await tx.update(transactions)
      .set(updates)
      .where(eq(transactions.id, existing.id));

    if (parsedCatId.data === null || !existing.merchantId) {
      return;
    }

    const [merchant] = await tx
      .select({ categoryId: merchants.categoryId })
      .from(merchants)
      .where(scoped.where(merchants, eq(merchants.id, existing.merchantId)))
      .limit(1);

    if (!merchant || merchant.categoryId === null) {
      // No existing default to conflict with — safe to set it automatically. This is
      // the common case: the first time we've seen this merchant get manually categorized.
      await tx.update(merchants)
        .set({ categoryId: parsedCatId.data, updatedAt: new Date() })
        .where(scoped.where(merchants, eq(merchants.id, existing.merchantId)));
    } else if (merchant.categoryId !== parsedCatId.data) {
      // Merchant already defaults to a different category. Since a merchant can
      // legitimately span multiple categories (e.g. Amazon), don't silently overwrite
      // that default for every other transaction from this merchant — surface the
      // conflict so the caller can ask the user whether to apply it more broadly.
      merchantCategoryConflict = { merchantId: existing.merchantId, currentCategoryId: merchant.categoryId };
    }
  });

  revalidatePath("/transactions");
  return merchantCategoryConflict ? { success: true, merchantCategoryConflict } : { success: true };
}

export async function updateTransactionCategory(
  transactionId: string,
  categoryId: string | null,
  db: LedgrDb = defaultDb,
): Promise<UpdateTransactionCategoryResult> {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;
  return updateTransactionCategoryScoped(auth.householdId, transactionId, categoryId, db);
}

export async function toggleReviewed(
  transactionId: string,
  db: LedgrDb = defaultDb,
): Promise<{ success: true; reviewed: boolean } | { error: string }> {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;
  const { householdId } = auth;

  const parsedId = transactionIdSchema.safeParse(transactionId);
  if (!parsedId.success) {
    return { error: "Invalid input" };
  }

  const scoped = scopedQuery(householdId, db);
  const [existing] = await db
    .select({ id: transactions.id, reviewed: transactions.reviewed })
    .from(transactions)
    .where(scoped.where(transactions, eq(transactions.id, parsedId.data), notDeleted(transactions)))
    .limit(1);

  if (!existing) {
    return { error: "Transaction not found" };
  }

  const newReviewed = !existing.reviewed;
  await db.update(transactions)
    .set({ reviewed: newReviewed, updatedAt: new Date() })
    .where(eq(transactions.id, existing.id));

  revalidatePath("/transactions");
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

  const auth = await authorizeAction();
  if ("error" in auth) return auth;
  const { householdId } = auth;
  const scoped = scopedQuery(householdId, db);

  const owned = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      scoped.where(
        transactions,
        inArray(transactions.id, parsedIds.data),
        notDeleted(transactions),
      ),
    );

  if (owned.length === 0) {
    return { success: true, updatedCount: 0 };
  }

  const ownedIds = owned.map((r) => r.id);
  const updates = buildCategoryUpdate(categoryId);

  await db.update(transactions)
    .set(updates)
    .where(inArray(transactions.id, ownedIds));

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

  const auth = await authorizeAction();
  if ("error" in auth) return auth;
  const { householdId } = auth;
  const scoped = scopedQuery(householdId, db);

  const owned = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      scoped.where(
        transactions,
        inArray(transactions.id, parsedIds.data),
        notDeleted(transactions),
      ),
    );

  if (owned.length === 0) {
    return { success: true, updatedCount: 0 };
  }

  const ownedIds = owned.map((r) => r.id);
  await db.update(transactions)
    .set({ reviewed, updatedAt: new Date() })
    .where(inArray(transactions.id, ownedIds));

  revalidatePath("/transactions");
  return { success: true, updatedCount: ownedIds.length };
}

export async function loadMoreTransactions(
  filters: TransactionFilters,
  cursor: string,
  db: LedgrDb = defaultDb,
): Promise<TransactionPage> {
  const parsedFilters = transactionFiltersSchema.safeParse(filters);
  if (!parsedFilters.success) {
    throw new Error("Invalid filters");
  }
  const parsedCursor = z.string().min(1).safeParse(cursor);
  if (!parsedCursor.success) {
    throw new Error("Invalid cursor");
  }
  const householdId = await getHouseholdId();
  return getTransactions(householdId, parsedFilters.data, 50, parsedCursor.data, db);
}
