import { v4 as uuid } from "uuid";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { categorizeSyncedTransactions } from "@/lib/categorization/engine";
import type { PlaidApi } from "plaid";
import {
  PlaidSyncResponseSchema,
  type PlaidTransaction,
  type PlaidRemovedTransaction,
} from "./schemas";
import { plaidAmountToCents, normalizeAmount } from "@/lib/money";
import { decrypt } from "@/lib/encryption";
import { getPlaidClient } from "./client";
import {
  extractPlaidErrorCode,
  titleCase,
  REAUTH_ERROR_CODES,
  TRANSIENT_ERROR_CODES,
  retryWithBackoff,
} from "./utils";
import { cleanTransactionName } from "@/lib/import/clean-name";
import type { LedgrDb } from "@/db";
import {
  plaidItems,
  syncLog,
  transactions,
  accounts,
  merchants,
} from "@/db/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SyncResult =
  | {
      success: true;
      addedCount: number;
      modifiedCount: number;
      removedCount: number;
      syncedAt: string;
    }
  | { success: false; error: string };

interface FetchAllPagesResult {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: PlaidRemovedTransaction[];
  nextCursor: string;
  accounts: AccountBalanceInfo[];
}

export interface ProcessedBatch {
  inserts: TransactionRow[];
  upserts: TransactionRow[];
  merchantUpserts: MerchantUpsert[];
  pendingToRemove: string[]; // plaid_transaction_ids to soft-delete
  removedIds: string[]; // plaid_transaction_ids to soft-delete
}

interface TransactionRow {
  plaidTransactionId: string;
  plaidAccountId: string;
  date: string;
  originalName: string;
  name: string;
  amount: number;
  normalizedAmount: number;
  currency: string;
  pending: boolean;
  pendingTransactionId: string | null;
  merchantName: string | null;
  logoUrl: string | null;
  pfcPrimary: string | null;
  pfcDetailed: string | null;
  isTransfer: boolean;
}

interface MerchantUpsert {
  normalizedName: string;
  rawNames: string[];
  logoUrl: string | null;
}

// ---------------------------------------------------------------------------
// 1. fetchAllPages
// ---------------------------------------------------------------------------

async function fetchAllPages(
  client: PlaidApi,
  accessToken: string,
  cursor: string | null,
): Promise<FetchAllPagesResult> {
  const allAdded: PlaidTransaction[] = [];
  const allModified: PlaidTransaction[] = [];
  const allRemoved: PlaidRemovedTransaction[] = [];
  const accountsMap = new Map<string, AccountBalanceInfo>();
  let currentCursor = cursor;

  let hasMore = true;
  while (hasMore) {
    const requestBody: {
      access_token: string;
      cursor?: string;
      options?: { include_personal_finance_category: boolean };
    } = {
      access_token: accessToken,
      options: { include_personal_finance_category: true },
    };
    if (currentCursor !== null) {
      requestBody.cursor = currentCursor;
    }

    const response = await retryWithBackoff(async () => {
      const res = await client.transactionsSync(requestBody);
      return res.data;
    });

    const parsed = PlaidSyncResponseSchema.parse(response);

    allAdded.push(...parsed.added);
    allModified.push(...parsed.modified);
    allRemoved.push(...parsed.removed);
    if (parsed.accounts) {
      for (const account of parsed.accounts) {
        accountsMap.set(account.account_id, account);
      }
    }
    currentCursor = parsed.next_cursor;
    hasMore = parsed.has_more;
  }

  return {
    added: allAdded,
    modified: allModified,
    removed: allRemoved,
    nextCursor: currentCursor!,
    accounts: Array.from(accountsMap.values()),
  };
}

// ---------------------------------------------------------------------------
// 2. processBatch
// ---------------------------------------------------------------------------

export function processBatch(
  added: PlaidTransaction[],
  modified: PlaidTransaction[],
  removed: PlaidRemovedTransaction[],
  householdId: string,
  accountTypeMap: Map<string, string>,
): ProcessedBatch {
  // Build merchant upserts (deduplicated by normalized name)
  const merchantMap = new Map<string, MerchantUpsert>();

  function collectMerchant(txn: PlaidTransaction) {
    if (!txn.merchant_name) return;
    const normalized = titleCase(txn.merchant_name);
    const existing = merchantMap.get(normalized);
    if (existing) {
      if (!existing.rawNames.includes(txn.merchant_name)) {
        existing.rawNames.push(txn.merchant_name);
      }
      if (!existing.logoUrl && txn.logo_url) {
        existing.logoUrl = txn.logo_url;
      }
    } else {
      merchantMap.set(normalized, {
        normalizedName: normalized,
        rawNames: [txn.merchant_name],
        logoUrl: txn.logo_url ?? null,
      });
    }
  }

  function toRow(txn: PlaidTransaction): TransactionRow {
    const amountCents = plaidAmountToCents(txn.amount)!;
    const accountType = accountTypeMap.get(txn.account_id) ?? "other";
    const normalizedAmt = normalizeAmount(amountCents, accountType);
    return {
      plaidTransactionId: txn.transaction_id,
      plaidAccountId: txn.account_id,
      date: txn.date,
      originalName: txn.name,
      name: txn.merchant_name ? titleCase(txn.merchant_name) : cleanTransactionName(txn.name),
      amount: amountCents,
      normalizedAmount: normalizedAmt,
      currency: txn.iso_currency_code ?? "USD",
      pending: txn.pending,
      pendingTransactionId: txn.pending_transaction_id ?? null,
      merchantName: txn.merchant_name ? titleCase(txn.merchant_name) : null,
      logoUrl: txn.logo_url ?? null,
      pfcPrimary: txn.personal_finance_category?.primary ?? null,
      pfcDetailed: txn.personal_finance_category?.detailed ?? null,
      isTransfer: ["TRANSFER_IN", "TRANSFER_OUT", "LOAN_PAYMENTS"].includes(
        txn.personal_finance_category?.primary ?? "",
      ),
    };
  }

  // Detect pending→posted transitions
  const pendingToRemove: string[] = [];
  for (const txn of added) {
    if (txn.pending_transaction_id) {
      pendingToRemove.push(txn.pending_transaction_id);
    }
  }

  function processTransactions(txns: PlaidTransaction[]): TransactionRow[] {
    return txns.map((txn) => {
      collectMerchant(txn);
      return toRow(txn);
    });
  }

  const inserts = processTransactions(added);
  const upserts = processTransactions(modified);

  // Removed IDs
  const removedIds = removed.map((r) => r.transaction_id);

  return {
    inserts,
    upserts,
    merchantUpserts: Array.from(merchantMap.values()),
    pendingToRemove,
    removedIds,
  };
}

// ---------------------------------------------------------------------------
// 3. applyToDb
// ---------------------------------------------------------------------------

interface AccountBalanceInfo {
  account_id: string;
  balances: {
    current: number | null;
    available: number | null;
    limit: number | null;
    iso_currency_code: string | null;
  };
}

async function applyToDb(
  db: LedgrDb,
  processed: ProcessedBatch,
  itemId: string,
  householdId: string,
  newCursor: string,
  accountBalances: AccountBalanceInfo[] = [],
): Promise<{ addedCount: number; modifiedCount: number; removedCount: number }> {
  const now = new Date();

  return db.transaction(async (tx) => {
    // --- Build account lookup: plaid_account_id → internal account id ---
    const accountRows = await tx
      .select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId })
      .from(accounts)
      .where(
        and(
          eq(accounts.householdId, householdId),
          eq(accounts.plaidItemId, itemId),
          isNull(accounts.deletedAt),
        ),
      );

    const plaidToInternal = new Map<string, string>();
    for (const row of accountRows) {
      if (row.plaidAccountId) {
        plaidToInternal.set(row.plaidAccountId, row.id);
      }
    }

    // --- Upsert merchants ---
    // Look up all existing merchants for this batch in one query rather than a
    // SELECT per merchant. Existing rows still need per-row UPDATEs (each merges
    // a different rawNames set); new rows are bulk-inserted.
    const merchantNameToId = new Map<string, string>();
    const upsertNames = processed.merchantUpserts.map((mu) => mu.normalizedName);
    const existingMerchants = upsertNames.length
      ? await tx
          .select({ id: merchants.id, name: merchants.name, rawNames: merchants.rawNames })
          .from(merchants)
          .where(
            and(
              eq(merchants.householdId, householdId),
              inArray(merchants.name, upsertNames),
            ),
          )
      : [];
    const existingByName = new Map(existingMerchants.map((m) => [m.name, m]));

    const newMerchantRows: (typeof merchants.$inferInsert)[] = [];
    for (const mu of processed.merchantUpserts) {
      const existing = existingByName.get(mu.normalizedName);
      if (existing) {
        // Merge raw names
        const existingRaw: string[] = existing.rawNames
          ? JSON.parse(existing.rawNames)
          : [];
        const merged = Array.from(new Set([...existingRaw, ...mu.rawNames]));
        await tx.update(merchants)
          .set({
            rawNames: JSON.stringify(merged),
            logoUrl: mu.logoUrl ?? undefined,
            updatedAt: now,
          })
          .where(eq(merchants.id, existing.id));
        merchantNameToId.set(mu.normalizedName, existing.id);
      } else {
        const merchantId = uuid();
        newMerchantRows.push({
          id: merchantId,
          householdId,
          name: mu.normalizedName,
          rawNames: JSON.stringify(mu.rawNames),
          logoUrl: mu.logoUrl,
          createdAt: now,
          updatedAt: now,
        });
        merchantNameToId.set(mu.normalizedName, merchantId);
      }
    }
    if (newMerchantRows.length) {
      await tx.insert(merchants).values(newMerchantRows);
    }

    // --- Insert new transactions (one multi-row insert, not one per row) ---
    const insertRows: (typeof transactions.$inferInsert)[] = [];
    for (const row of processed.inserts) {
      const internalAccountId = plaidToInternal.get(row.plaidAccountId);
      if (!internalAccountId) continue; // skip if account not found

      const merchantId = row.merchantName
        ? merchantNameToId.get(row.merchantName) ?? null
        : null;

      insertRows.push({
        id: uuid(),
        accountId: internalAccountId,
        householdId,
        plaidTransactionId: row.plaidTransactionId,
        pendingTransactionId: row.pendingTransactionId,
        merchantId,
        date: row.date,
        originalName: row.originalName,
        name: row.name,
        amount: row.amount,
        normalizedAmount: row.normalizedAmount,
        currency: row.currency,
        pending: row.pending,
        pfcPrimary: row.pfcPrimary,
        pfcDetailed: row.pfcDetailed,
        isTransfer: row.isTransfer,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (insertRows.length) {
      await tx.insert(transactions).values(insertRows);
    }
    const addedCount = insertRows.length;

    // --- Upsert modified transactions ---
    // Fetch all existing rows for the batch in one query rather than a SELECT
    // per row. Existing rows get per-row UPDATEs (each carries different values);
    // rows not yet present are bulk-inserted.
    const upsertsWithAccount = processed.upserts
      .map((row) => ({ row, internalAccountId: plaidToInternal.get(row.plaidAccountId) }))
      .filter((x): x is { row: TransactionRow; internalAccountId: string } => !!x.internalAccountId);

    const upsertPlaidIds = upsertsWithAccount.map(({ row }) => row.plaidTransactionId);
    const existingUpsertRows = upsertPlaidIds.length
      ? await tx
          .select({ id: transactions.id, plaidTransactionId: transactions.plaidTransactionId })
          .from(transactions)
          .where(inArray(transactions.plaidTransactionId, upsertPlaidIds))
      : [];
    const existingIdByPlaidId = new Map(
      existingUpsertRows.map((r) => [r.plaidTransactionId, r.id]),
    );

    const upsertInsertRows: (typeof transactions.$inferInsert)[] = [];
    for (const { row, internalAccountId } of upsertsWithAccount) {
      const merchantId = row.merchantName
        ? merchantNameToId.get(row.merchantName) ?? null
        : null;

      const existingId = existingIdByPlaidId.get(row.plaidTransactionId);
      if (existingId) {
        await tx.update(transactions)
          .set({
            accountId: internalAccountId,
            merchantId,
            date: row.date,
            originalName: row.originalName,
            name: row.name,
            amount: row.amount,
            normalizedAmount: row.normalizedAmount,
            currency: row.currency,
            pending: row.pending,
            pendingTransactionId: row.pendingTransactionId,
            pfcPrimary: row.pfcPrimary,
            pfcDetailed: row.pfcDetailed,
            isTransfer: row.isTransfer,
            updatedAt: now,
            // Preserve user's manual categorization and reviewed status
          })
          .where(eq(transactions.id, existingId));
      } else {
        upsertInsertRows.push({
          id: uuid(),
          accountId: internalAccountId,
          householdId,
          plaidTransactionId: row.plaidTransactionId,
          pendingTransactionId: row.pendingTransactionId,
          merchantId,
          date: row.date,
          originalName: row.originalName,
          name: row.name,
          amount: row.amount,
          normalizedAmount: row.normalizedAmount,
          currency: row.currency,
          pending: row.pending,
          pfcPrimary: row.pfcPrimary,
          pfcDetailed: row.pfcDetailed,
          isTransfer: row.isTransfer,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    if (upsertInsertRows.length) {
      await tx.insert(transactions).values(upsertInsertRows);
    }
    const modifiedCount = upsertsWithAccount.length;

    // --- Soft-delete pending→posted replacements, inheriting category ---
    for (const pendingPlaidId of processed.pendingToRemove) {
      const [pendingRow] = await tx
        .select({
          categoryId: transactions.categoryId,
          categorySource: transactions.categorySource,
          reviewed: transactions.reviewed,
        })
        .from(transactions)
        .where(eq(transactions.plaidTransactionId, pendingPlaidId))
        .limit(1);

      await tx.update(transactions)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(transactions.plaidTransactionId, pendingPlaidId));

      // If the pending transaction was manually categorized, copy to the posted version
      if (pendingRow?.categoryId) {
        const [postedTxn] = await tx
          .select({ id: transactions.id })
          .from(transactions)
          .where(
            and(
              eq(transactions.pendingTransactionId, pendingPlaidId),
              isNull(transactions.deletedAt),
            ),
          )
          .limit(1);

        if (postedTxn) {
          await tx.update(transactions)
            .set({
              categoryId: pendingRow.categoryId,
              categorySource: pendingRow.categorySource,
              reviewed: pendingRow.reviewed,
              updatedAt: now,
            })
            .where(eq(transactions.id, postedTxn.id));
        }
      }
    }

    // --- Soft-delete removed transactions ---
    let removedCount = 0;
    for (const removedPlaidId of processed.removedIds) {
      const result = await tx
        .update(transactions)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(transactions.plaidTransactionId, removedPlaidId));
      if (result.rowCount && result.rowCount > 0) removedCount++;
    }

    // --- Update account balances ---
    for (const ab of accountBalances) {
      const internalId = plaidToInternal.get(ab.account_id);
      if (!internalId) continue;

      await tx.update(accounts)
        .set({
          currentBalance: plaidAmountToCents(ab.balances.current),
          availableBalance: plaidAmountToCents(ab.balances.available),
          creditLimit: plaidAmountToCents(ab.balances.limit),
          updatedAt: now,
        })
        .where(eq(accounts.id, internalId));
    }

    // --- Update sync cursor ---
    await tx.update(plaidItems)
      .set({ syncCursor: newCursor, updatedAt: now })
      .where(eq(plaidItems.id, itemId));

    // --- Write sync_log entry ---
    await tx.insert(syncLog)
      .values({
        id: uuid(),
        plaidItemId: itemId,
        cursorAfter: newCursor,
        addedCount,
        modifiedCount,
        removedCount,
        syncedAt: now,
      });

    // --- Reset item status to active ---
    await tx.update(plaidItems)
      .set({ status: "active", errorCode: null, updatedAt: now })
      .where(eq(plaidItems.id, itemId));

    return { addedCount, modifiedCount, removedCount };
  });
}

// ---------------------------------------------------------------------------
// 4. syncInstitution — orchestrator
// ---------------------------------------------------------------------------

const activeSyncs = new Map<string, Promise<SyncResult>>();

export async function syncInstitution(
  itemId: string,
  householdId: string,
  db: LedgrDb,
): Promise<SyncResult> {
  // Per-item in-process lock
  const existing = activeSyncs.get(itemId);
  if (existing) {
    return existing;
  }

  const promise = doSync(itemId, householdId, db);
  activeSyncs.set(itemId, promise);

  try {
    return await promise;
  } finally {
    activeSyncs.delete(itemId);
  }
}

async function doSync(
  itemId: string,
  householdId: string,
  db: LedgrDb,
): Promise<SyncResult> {
  const now = new Date();

  try {
    // Read plaid_items row
    const [item] = await db
      .select()
      .from(plaidItems)
      .where(
        and(eq(plaidItems.id, itemId), eq(plaidItems.householdId, householdId)),
      )
      .limit(1);

    if (!item) {
      return { success: false, error: `Plaid item ${itemId} not found` };
    }

    // Decrypt access token
    const accessToken = decrypt(item.accessToken);

    // Build accountTypeMap
    const accountRows = await db
      .select({
        plaidAccountId: accounts.plaidAccountId,
        type: accounts.type,
      })
      .from(accounts)
      .where(
        and(
          eq(accounts.householdId, householdId),
          eq(accounts.plaidItemId, itemId),
          isNull(accounts.deletedAt),
        ),
      );

    const accountTypeMap = new Map<string, string>();
    for (const row of accountRows) {
      if (row.plaidAccountId) {
        accountTypeMap.set(row.plaidAccountId, row.type);
      }
    }

    // Fetch all pages
    const client = getPlaidClient();
    const cursor = item.syncCursor ?? null;
    const fetchResult = await fetchAllPages(client, accessToken, cursor);

    // Process batch
    const processed = processBatch(
      fetchResult.added,
      fetchResult.modified,
      fetchResult.removed,
      householdId,
      accountTypeMap,
    );

    // Apply to DB
    const counts = await applyToDb(
      db,
      processed,
      itemId,
      householdId,
      fetchResult.nextCursor,
      fetchResult.accounts,
    );

    // Auto-categorize newly synced transactions (non-fatal)
    try {
      await categorizeSyncedTransactions(itemId, householdId, db);
    } catch (catError) {
      console.error(`Categorization failed for item ${itemId}:`, catError);
    }

    // AI categorization (async, non-fatal, separate from sync engine)
    try {
      const { categorizeWithAi } = await import("@/lib/ai/categorize");
      await categorizeWithAi(householdId, db);
    } catch (aiError) {
      console.error(`AI categorization failed for item ${itemId}:`, aiError);
    }

    return {
      success: true,
      addedCount: counts.addedCount,
      modifiedCount: counts.modifiedCount,
      removedCount: counts.removedCount,
      syncedAt: now.toISOString(),
    };
  } catch (err: unknown) {
    const errorCode = extractPlaidErrorCode(err);
    const errorMessage =
      err instanceof Error ? err.message : "Unknown sync error";

    // Classify error and update item status
    if (errorCode && REAUTH_ERROR_CODES.has(errorCode)) {
      await db.update(plaidItems)
        .set({
          status: "reauth_required",
          errorCode,
          updatedAt: now,
        })
        .where(eq(plaidItems.id, itemId));
    } else if (errorCode && TRANSIENT_ERROR_CODES.has(errorCode)) {
      await db.update(plaidItems)
        .set({
          status: "error",
          errorCode,
          updatedAt: now,
        })
        .where(eq(plaidItems.id, itemId));
    }

    // Write error sync_log entry
    await db.insert(syncLog)
      .values({
        id: uuid(),
        plaidItemId: itemId,
        error: errorCode ?? errorMessage,
        syncedAt: now,
      });

    return { success: false, error: errorCode ?? errorMessage };
  }
}
