"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { db as defaultDb, type LedgrDb } from "@/db";
import { transactions, transactionSplits } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted, countRows } from "@/lib/query-helpers";
import { authorizeAction } from "@/lib/auth/authorize-action";
import { getHouseholdId } from "@/lib/auth/session";
import { getTransactionDetail, type TransactionDetail } from "@/queries/transactions";

const transactionIdSchema = z.string().min(1);

const updateFieldsSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    notes: z.string().max(2000).optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
      .optional(),
    isTransfer: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field required",
  });

const splitSchema = z.object({
  categoryId: z.string().min(1),
  amount: z.number().int().positive(),
  notes: z.string().max(500).nullable(),
});


export async function fetchTransactionDetail(
  transactionId: string,
  db: LedgrDb = defaultDb,
): Promise<{ data: TransactionDetail } | { error: string }> {
  const householdId = await getHouseholdId();
  const parsed = transactionIdSchema.safeParse(transactionId);
  if (!parsed.success) return { error: "Invalid input" };

  const detail = await getTransactionDetail(householdId, parsed.data, db);
  if (!detail) return { error: "deleted" };

  return { data: detail };
}


export async function updateTransactionFields(
  transactionId: string,
  data: z.input<typeof updateFieldsSchema>,
  db: LedgrDb = defaultDb,
): Promise<{ success: true } | { error: string }> {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;
  const { householdId } = auth;

  const parsedId = transactionIdSchema.safeParse(transactionId);
  const parsedData = updateFieldsSchema.safeParse(data);
  if (!parsedId.success || !parsedData.success) return { error: "Invalid input" };

  const scoped = scopedQuery(householdId, db);
  const [existing] = await db
    .select({
      id: transactions.id,
      plaidTransactionId: transactions.plaidTransactionId,
      transferPairId: transactions.transferPairId,
    })
    .from(transactions)
    .where(
      scoped.where(transactions, eq(transactions.id, parsedId.data), notDeleted(transactions)),
    )
    .limit(1);

  if (!existing) return { error: "Transaction not found" };

  const fields = parsedData.data;

  if (fields.date && existing.plaidTransactionId) {
    return { error: "Cannot edit date on bank-synced transactions" };
  }

  if (fields.isTransfer === false && existing.transferPairId) {
    await db.transaction(async (tx) => {
      await tx.update(transactions)
        .set({ isTransfer: false, transferPairId: null, updatedAt: new Date() })
        .where(eq(transactions.id, existing.id));
      await tx.update(transactions)
        .set({ isTransfer: false, transferPairId: null, updatedAt: new Date() })
        .where(eq(transactions.id, existing.transferPairId!));
    });
    if (Object.keys(fields).length === 1) return { success: true };
  }

  const updates: Partial<typeof transactions.$inferInsert> = { updatedAt: new Date() };
  if (fields.name !== undefined) updates.name = fields.name;
  if (fields.notes !== undefined) updates.notes = fields.notes;
  if (fields.date !== undefined) updates.date = fields.date;
  if (fields.isTransfer !== undefined) updates.isTransfer = fields.isTransfer;

  await db.update(transactions)
    .set(updates)
    .where(eq(transactions.id, existing.id));

  return { success: true };
}


export async function upsertSplit(
  transactionId: string,
  splitId: string | null,
  data: z.input<typeof splitSchema>,
  db: LedgrDb = defaultDb,
): Promise<
  | { data: { id: string; categoryId: string; amount: number; notes: string | null } }
  | { error: string }
> {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;
  const { householdId } = auth;

  const parsedId = transactionIdSchema.safeParse(transactionId);
  const parsedData = splitSchema.safeParse(data);
  if (!parsedId.success || !parsedData.success) return { error: "Invalid input" };

  const scoped = scopedQuery(householdId, db);
  const [txn] = await db
    .select({
      id: transactions.id,
      normalizedAmount: transactions.normalizedAmount,
    })
    .from(transactions)
    .where(scoped.where(transactions, eq(transactions.id, parsedId.data), notDeleted(transactions)))
    .limit(1);

  if (!txn) return { error: "Transaction not found" };

  const fields = parsedData.data;
  const maxAmount = Math.abs(txn.normalizedAmount);

  return db.transaction(async (tx) => {
    const existingSplits = await tx
      .select({ id: transactionSplits.id, amount: transactionSplits.amount })
      .from(transactionSplits)
      .where(eq(transactionSplits.transactionId, txn.id));

    const otherSplitsTotal = existingSplits
      .filter((s) => s.id !== splitId)
      .reduce((sum, s) => sum + s.amount, 0);

    if (otherSplitsTotal + fields.amount > maxAmount) {
      return { error: "Splits exceed transaction amount" };
    }

    let savedId: string;

    if (splitId) {
      await tx.update(transactionSplits)
        .set({
          categoryId: fields.categoryId,
          amount: fields.amount,
          notes: fields.notes,
        })
        .where(eq(transactionSplits.id, splitId));
      savedId = splitId;
    } else {
      savedId = uuid();
      await tx.insert(transactionSplits)
        .values({
          id: savedId,
          transactionId: txn.id,
          categoryId: fields.categoryId,
          amount: fields.amount,
          notes: fields.notes,
        });
    }

    if (existingSplits.length === 0 && !splitId) {
      await tx.update(transactions)
        .set({ categorySource: "manual", updatedAt: new Date() })
        .where(eq(transactions.id, txn.id));
    }

    return {
      data: {
        id: savedId,
        categoryId: fields.categoryId,
        amount: fields.amount,
        notes: fields.notes ?? null,
      },
    };
  });
}


export async function deleteSplit(
  splitId: string,
  db: LedgrDb = defaultDb,
): Promise<{ success: true } | { error: string }> {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;
  const { householdId } = auth;

  const parsedSplitId = transactionIdSchema.safeParse(splitId);
  if (!parsedSplitId.success) return { error: "Invalid input" };

  const [split] = await db
    .select({ id: transactionSplits.id, transactionId: transactionSplits.transactionId })
    .from(transactionSplits)
    .where(eq(transactionSplits.id, parsedSplitId.data))
    .limit(1);

  if (!split) return { error: "Split not found" };

  const scoped = scopedQuery(householdId, db);
  const [txn] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(scoped.where(transactions, eq(transactions.id, split.transactionId), notDeleted(transactions)))
    .limit(1);

  if (!txn) return { error: "Transaction not found" };

  return db.transaction(async (tx) => {
    await tx.delete(transactionSplits)
      .where(eq(transactionSplits.id, split.id));

    const [remaining] = await tx
      .select({ count: countRows() })
      .from(transactionSplits)
      .where(eq(transactionSplits.transactionId, txn.id))
      .limit(1);

    if (remaining && remaining.count === 0) {
      await tx.update(transactions)
        .set({ updatedAt: new Date() })
        .where(eq(transactions.id, txn.id));
    }

    return { success: true };
  });
}
