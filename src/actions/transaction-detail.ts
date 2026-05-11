"use server";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { db as defaultDb, type LedgrDb } from "@/db";
import { transactions, transactionSplits } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";
import { nowISO } from "@/lib/date-utils";
import { getHouseholdId, getSession } from "@/lib/auth/session";
import { guardDemoMode } from "@/lib/demo-mode";
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

  const detail = getTransactionDetail(householdId, parsed.data, db);
  if (!detail) return { error: "deleted" };

  return { data: detail };
}


export async function updateTransactionFields(
  transactionId: string,
  data: z.input<typeof updateFieldsSchema>,
  db: LedgrDb = defaultDb,
): Promise<{ success: true } | { error: string }> {
  const householdId = await getHouseholdId();
  const session = await getSession();
  const blocked = guardDemoMode(session!.user.id);
  if (blocked) return blocked;

  const parsedId = transactionIdSchema.safeParse(transactionId);
  const parsedData = updateFieldsSchema.safeParse(data);
  if (!parsedId.success || !parsedData.success) return { error: "Invalid input" };

  const scoped = scopedQuery(householdId, db);
  const existing = db
    .select({
      id: transactions.id,
      plaidTransactionId: transactions.plaidTransactionId,
      transferPairId: transactions.transferPairId,
    })
    .from(transactions)
    .where(
      scoped.where(transactions, eq(transactions.id, parsedId.data), notDeleted(transactions)),
    )
    .get();

  if (!existing) return { error: "Transaction not found" };

  const fields = parsedData.data;

  if (fields.date && existing.plaidTransactionId) {
    return { error: "Cannot edit date on bank-synced transactions" };
  }

  if (fields.isTransfer === false && existing.transferPairId) {
    db.transaction(() => {
      db.update(transactions)
        .set({ isTransfer: false, transferPairId: null, updatedAt: nowISO() })
        .where(eq(transactions.id, existing.id))
        .run();
      db.update(transactions)
        .set({ isTransfer: false, transferPairId: null, updatedAt: nowISO() })
        .where(eq(transactions.id, existing.transferPairId!))
        .run();
    });
    if (Object.keys(fields).length === 1) return { success: true };
  }

  const updates: Partial<typeof transactions.$inferInsert> = { updatedAt: nowISO() };
  if (fields.name !== undefined) updates.name = fields.name;
  if (fields.notes !== undefined) updates.notes = fields.notes;
  if (fields.date !== undefined) updates.date = fields.date;
  if (fields.isTransfer !== undefined) updates.isTransfer = fields.isTransfer;

  db.update(transactions)
    .set(updates)
    .where(eq(transactions.id, existing.id))
    .run();

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
  const householdId = await getHouseholdId();
  const session = await getSession();
  const blocked = guardDemoMode(session!.user.id);
  if (blocked) return blocked;

  const parsedId = transactionIdSchema.safeParse(transactionId);
  const parsedData = splitSchema.safeParse(data);
  if (!parsedId.success || !parsedData.success) return { error: "Invalid input" };

  const scoped = scopedQuery(householdId, db);
  const txn = db
    .select({
      id: transactions.id,
      normalizedAmount: transactions.normalizedAmount,
    })
    .from(transactions)
    .where(scoped.where(transactions, eq(transactions.id, parsedId.data), notDeleted(transactions)))
    .get();

  if (!txn) return { error: "Transaction not found" };

  const fields = parsedData.data;
  const maxAmount = Math.abs(txn.normalizedAmount);

  return db.transaction(() => {
    const existingSplits = db
      .select({ id: transactionSplits.id, amount: transactionSplits.amount })
      .from(transactionSplits)
      .where(eq(transactionSplits.transactionId, txn.id))
      .all();

    const otherSplitsTotal = existingSplits
      .filter((s) => s.id !== splitId)
      .reduce((sum, s) => sum + s.amount, 0);

    if (otherSplitsTotal + fields.amount > maxAmount) {
      return { error: "Splits exceed transaction amount" };
    }

    let savedId: string;

    if (splitId) {
      db.update(transactionSplits)
        .set({
          categoryId: fields.categoryId,
          amount: fields.amount,
          notes: fields.notes,
        })
        .where(eq(transactionSplits.id, splitId))
        .run();
      savedId = splitId;
    } else {
      savedId = uuid();
      db.insert(transactionSplits)
        .values({
          id: savedId,
          transactionId: txn.id,
          categoryId: fields.categoryId,
          amount: fields.amount,
          notes: fields.notes,
        })
        .run();
    }

    if (existingSplits.length === 0 && !splitId) {
      db.update(transactions)
        .set({ categorySource: "manual", updatedAt: nowISO() })
        .where(eq(transactions.id, txn.id))
        .run();
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
  const householdId = await getHouseholdId();
  const session = await getSession();
  const blocked = guardDemoMode(session!.user.id);
  if (blocked) return blocked;

  const parsedSplitId = transactionIdSchema.safeParse(splitId);
  if (!parsedSplitId.success) return { error: "Invalid input" };

  const split = db
    .select({ id: transactionSplits.id, transactionId: transactionSplits.transactionId })
    .from(transactionSplits)
    .where(eq(transactionSplits.id, parsedSplitId.data))
    .get();

  if (!split) return { error: "Split not found" };

  const scoped = scopedQuery(householdId, db);
  const txn = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(scoped.where(transactions, eq(transactions.id, split.transactionId), notDeleted(transactions)))
    .get();

  if (!txn) return { error: "Transaction not found" };

  return db.transaction(() => {
    db.delete(transactionSplits)
      .where(eq(transactionSplits.id, split.id))
      .run();

    const remaining = db
      .select({ count: sql<number>`count(*)` })
      .from(transactionSplits)
      .where(eq(transactionSplits.transactionId, txn.id))
      .get();

    if (remaining && remaining.count === 0) {
      db.update(transactions)
        .set({ updatedAt: nowISO() })
        .where(eq(transactions.id, txn.id))
        .run();
    }

    return { success: true };
  });
}
