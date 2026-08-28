import { v4 as uuid } from "uuid";
import { eq, and, isNull, inArray, desc } from "drizzle-orm";
import type { LedgrDb } from "@/db";
import { bankConnections, syncLog, transactions, accounts } from "@/db/schema";
import { decrypt } from "@/lib/encryption";
import { simplefinAmountToCents } from "@/lib/money";
import { cleanTransactionName } from "@/lib/import/clean-name";
import { simplefinRequest } from "./client";
import { SimplefinAccountsResponseSchema, type SimplefinAccount } from "./schemas";
import { classifyPollError } from "./utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SyncResult =
  | {
      success: true;
      addedCount: number;
      modifiedCount: number;
      syncedAt: string;
    }
  | { success: false; error: string };

export interface ProcessedBatch {
  rows: TransactionRow[];
}

interface TransactionRow {
  externalId: string;
  externalAccountId: string;
  date: string;
  originalName: string;
  name: string;
  amount: number;
  normalizedAmount: number;
  currency: string;
  pending: boolean;
}

interface AccountBalanceInfo {
  externalAccountId: string;
  currency: string;
  currentBalanceCents: number | null;
  availableBalanceCents: number | null;
}

// ---------------------------------------------------------------------------
// 1. processBatch — pure
// ---------------------------------------------------------------------------

/**
 * Flattens each SimpleFIN account's nested transactions into rows. Unlike
 * Plaid, SimpleFIN has no merchant/PFC data and keeps the same transaction id
 * across pending→posted, so there's no separate insert/upsert/removed split
 * here — the DB layer partitions by whether externalId already exists.
 */
export function processBatch(simplefinAccounts: SimplefinAccount[]): ProcessedBatch {
  const rows: TransactionRow[] = [];

  for (const account of simplefinAccounts) {
    for (const txn of account.transactions ?? []) {
      const amountCents = simplefinAmountToCents(txn.amount);
      if (amountCents === null) continue; // skip malformed amounts

      const epochSeconds = txn.transacted_at || txn.posted || Math.floor(Date.now() / 1000);
      const date = new Date(epochSeconds * 1000).toISOString().slice(0, 10);

      rows.push({
        externalId: txn.id,
        externalAccountId: account.id,
        date,
        originalName: txn.description,
        name: cleanTransactionName(txn.description) || txn.description,
        amount: amountCents,
        // SimpleFIN's positive=income convention already matches our
        // normalizedAmount invariant — no sign flip (see lib/money.ts).
        normalizedAmount: amountCents,
        currency: account.currency,
        pending: txn.pending ?? txn.posted === 0,
      });
    }
  }

  return { rows };
}

function balancesFromAccounts(simplefinAccounts: SimplefinAccount[]): AccountBalanceInfo[] {
  return simplefinAccounts.map((account) => ({
    externalAccountId: account.id,
    currency: account.currency,
    currentBalanceCents: simplefinAmountToCents(account.balance),
    availableBalanceCents: account["available-balance"]
      ? simplefinAmountToCents(account["available-balance"])
      : null,
  }));
}

// ---------------------------------------------------------------------------
// 2. applyToDb
// ---------------------------------------------------------------------------

async function applyToDb(
  db: LedgrDb,
  processed: ProcessedBatch,
  balances: AccountBalanceInfo[],
  connectionId: string,
  householdId: string,
): Promise<{ addedCount: number; modifiedCount: number }> {
  const now = new Date();

  return db.transaction(async (tx) => {
    const accountRows = await tx
      .select({ id: accounts.id, externalAccountId: accounts.externalAccountId })
      .from(accounts)
      .where(
        and(
          eq(accounts.householdId, householdId),
          eq(accounts.bankConnectionId, connectionId),
          isNull(accounts.deletedAt),
        ),
      );

    const externalToInternal = new Map<string, string>();
    for (const row of accountRows) {
      if (row.externalAccountId) externalToInternal.set(row.externalAccountId, row.id);
    }

    const rowsWithAccount = processed.rows
      .map((row) => ({ row, internalAccountId: externalToInternal.get(row.externalAccountId) }))
      .filter((x): x is { row: TransactionRow; internalAccountId: string } => !!x.internalAccountId);

    const externalIds = rowsWithAccount.map(({ row }) => row.externalId);
    const existingRows = externalIds.length
      ? await tx
          .select({ id: transactions.id, externalId: transactions.externalId })
          .from(transactions)
          .where(inArray(transactions.externalId, externalIds))
      : [];
    const existingIdByExternalId = new Map(existingRows.map((r) => [r.externalId, r.id]));

    const insertRows: (typeof transactions.$inferInsert)[] = [];
    let modifiedCount = 0;

    for (const { row, internalAccountId } of rowsWithAccount) {
      const existingId = existingIdByExternalId.get(row.externalId);
      if (existingId) {
        modifiedCount++;
        await tx.update(transactions)
          .set({
            accountId: internalAccountId,
            date: row.date,
            originalName: row.originalName,
            name: row.name,
            amount: row.amount,
            normalizedAmount: row.normalizedAmount,
            currency: row.currency,
            pending: row.pending,
            updatedAt: now,
            // categoryId/reviewed/categorySource are preserved (not touched)
          })
          .where(eq(transactions.id, existingId));
      } else {
        insertRows.push({
          id: uuid(),
          accountId: internalAccountId,
          householdId,
          externalId: row.externalId,
          provider: "simplefin",
          date: row.date,
          originalName: row.originalName,
          name: row.name,
          amount: row.amount,
          normalizedAmount: row.normalizedAmount,
          currency: row.currency,
          pending: row.pending,
          pfcPrimary: null,
          pfcDetailed: null,
          isTransfer: false,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    if (insertRows.length) {
      await tx.insert(transactions).values(insertRows);
    }
    const addedCount = insertRows.length;

    for (const balance of balances) {
      const internalId = externalToInternal.get(balance.externalAccountId);
      if (!internalId) continue;
      await tx.update(accounts)
        .set({
          currentBalance: balance.currentBalanceCents,
          availableBalance: balance.availableBalanceCents,
          updatedAt: now,
        })
        .where(eq(accounts.id, internalId));
    }

    await tx.insert(syncLog)
      .values({
        id: uuid(),
        connectionId,
        addedCount,
        modifiedCount,
        removedCount: 0,
        syncedAt: now,
      });

    await tx.update(bankConnections)
      .set({ status: "active", errorCode: null, updatedAt: now })
      .where(eq(bankConnections.id, connectionId));

    return { addedCount, modifiedCount };
  });
}

// ---------------------------------------------------------------------------
// 3. syncConnection — orchestrator
// ---------------------------------------------------------------------------

const activeSyncs = new Map<string, Promise<SyncResult>>();

export async function syncConnection(
  connectionId: string,
  householdId: string,
  db: LedgrDb,
): Promise<SyncResult> {
  const existing = activeSyncs.get(connectionId);
  if (existing) return existing;

  const promise = doSync(connectionId, householdId, db);
  activeSyncs.set(connectionId, promise);

  try {
    return await promise;
  } finally {
    activeSyncs.delete(connectionId);
  }
}

async function doSync(
  connectionId: string,
  householdId: string,
  db: LedgrDb,
): Promise<SyncResult> {
  const now = new Date();

  try {
    const [connection] = await db
      .select()
      .from(bankConnections)
      .where(and(eq(bankConnections.id, connectionId), eq(bankConnections.householdId, householdId)))
      .limit(1);

    if (!connection) {
      return { success: false, error: `SimpleFIN connection ${connectionId} not found` };
    }

    const accessUrl = decrypt(connection.credential);

    // Bound the poll to since-last-sync (with a 7-day lookback buffer, so
    // recently-pending transactions that changed amount/status get picked
    // back up) — omit start-date entirely on first sync.
    const [lastSync] = await db
      .select({ syncedAt: syncLog.syncedAt })
      .from(syncLog)
      .where(eq(syncLog.connectionId, connectionId))
      .orderBy(desc(syncLog.syncedAt))
      .limit(1);

    const startDate = lastSync
      ? Math.floor(lastSync.syncedAt.getTime() / 1000) - 7 * 24 * 60 * 60
      : undefined;

    const raw = await simplefinRequest(accessUrl, "/accounts", {
      pending: 1,
      version: 2,
      "start-date": startDate,
    });
    const parsed = SimplefinAccountsResponseSchema.parse(raw);

    const processed = processBatch(parsed.accounts);
    const balances = balancesFromAccounts(parsed.accounts);
    const counts = await applyToDb(db, processed, balances, connectionId, householdId);

    return {
      success: true,
      addedCount: counts.addedCount,
      modifiedCount: counts.modifiedCount,
      syncedAt: now.toISOString(),
    };
  } catch (err: unknown) {
    const { status, errorCode, message } = classifyPollError(err);

    await db.update(bankConnections)
      .set({ status, errorCode, updatedAt: now })
      .where(eq(bankConnections.id, connectionId));

    await db.insert(syncLog)
      .values({
        id: uuid(),
        connectionId,
        error: message,
        syncedAt: now,
      });

    return { success: false, error: message };
  }
}
