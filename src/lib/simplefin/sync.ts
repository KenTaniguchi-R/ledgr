import { v4 as uuid } from "uuid";
import { eq, and, isNull, inArray, desc } from "drizzle-orm";
import type { LedgrDb } from "@/db";
import { bankConnections, syncLog, transactions, accounts, investmentHoldings, holdingsHistory, institutionLogos } from "@/db/schema";
import { decrypt } from "@/lib/encryption";
import { simplefinAmountToCents } from "@/lib/money";
import { cleanTransactionName } from "@/lib/import/clean-name";
import { todayDateString } from "@/lib/date-utils";
import { simplefinRequest } from "./client";
import { SimplefinAccountsResponseSchema, resolveInstitution, type SimplefinAccount, type SimplefinConnection, type SimplefinHolding } from "./schemas";
import { classifyPollError } from "./utils";
import { fetchFaviconDataUri } from "@/lib/favicon";
import { categorizeSyncedTransactions } from "@/lib/categorization/engine";
import { applyTransferDetection } from "@/lib/transfer-detection";
import { applyRecurringDetection } from "@/lib/simplefin/recurring";
import { withHousehold } from "@/lib/household-context";

// SimpleFIN brokerages don't send a security type the way Plaid does. These
// static lists cover the tickers common enough to be worth a dedicated
// allocation bucket. Anything we cannot place -- an unlisted ticker, or no
// ticker at all -- falls back to "other" rather than being guessed at.
const KNOWN_CRYPTO_SYMBOLS = new Set(["BTC", "ETH", "SOL", "DOGE", "LTC", "BCH", "ADA", "XRP", "USDC", "USDT"]);
const KNOWN_BOND_SYMBOLS = new Set(["BND", "AGG", "TLT", "IEF", "SHY", "LQD", "HYG", "MUB", "BNDX", "VCIT", "VCSH"]);
const KNOWN_ETF_SYMBOLS = new Set([
  "VOO", "VTI", "SPY", "IVV", "QQQ", "QQQM", "VXUS", "VUG", "VYM", "VEA", "VWO",
  "SCHD", "ARKK", "IWM", "DIA", "GLD", "SLV", "XLK", "XLF", "XLE", "XLV",
]);
// Sweep/money-market positions. Without these they'd fall through to the
// "other" default and sit in the unclassified bucket, when they are in fact
// known cash and belong in the cash slice.
const KNOWN_CASH_SYMBOLS = new Set([
  "SPAXX", "VMFXX", "SWVXX", "FDRXX", "VMRXX", "SPRXX", "FZFXX", "SNVXX", "SNSXX",
]);

/**
 * SimpleFIN denotes a plain currency balance as `CUR:USD` and similar, rather
 * than a security symbol.
 */
function isCurrencySymbol(ticker: string): boolean {
  return ticker.startsWith("CUR:");
}

function inferHoldingType(symbol: string | null): HoldingRow["type"] {
  if (!symbol) return "other";
  const ticker = symbol.toUpperCase();
  if (isCurrencySymbol(ticker) || KNOWN_CASH_SYMBOLS.has(ticker)) return "cash";
  if (KNOWN_CRYPTO_SYMBOLS.has(ticker)) return "crypto";
  if (KNOWN_BOND_SYMBOLS.has(ticker)) return "bond";
  if (KNOWN_ETF_SYMBOLS.has(ticker)) return "etf";
  // Unrecognized ticker. The allowlists above cannot cover the long tail, so
  // guessing "stock" turns an unknown into a confident misclassification --
  // IBIT (a spot-bitcoin ETF) was charted as equity. "other" is honest.
  return "other";
}

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

export interface HoldingRow {
  externalAccountId: string;
  securityId: string;
  securityName: string;
  ticker: string | null;
  quantity: number;
  costBasis: number | null;
  currentValue: number;
  type: "crypto" | "etf" | "bond" | "stock" | "cash" | "other";
  currency: string;
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

/** Stable per-security identifier — SimpleFIN has no security master, so the ticker stands in for Plaid's security_id. */
function simplefinSecurityId(holding: SimplefinHolding): string {
  const symbol = holding.symbol?.trim();
  if (symbol) return `simplefin:${symbol.toUpperCase()}`;
  const description = holding.description?.trim();
  if (description) return `simplefin:${description.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return `simplefin:${holding.id}`;
}

/**
 * Robinhood's SimpleFIN feed (and reportedly others) always sends
 * cost_basis "0.00" while purchase_price is populated correctly, so a
 * literal zero cost basis is treated as "not reported" and approximated
 * from purchase_price × shares instead of taken at face value.
 */
function resolveCostBasisCents(holding: SimplefinHolding, quantity: number): number | null {
  const reported = holding.cost_basis ? simplefinAmountToCents(holding.cost_basis) : null;
  if (reported) return reported;
  const purchasePriceCents = holding.purchase_price ? simplefinAmountToCents(holding.purchase_price) : null;
  if (purchasePriceCents !== null) return Math.round(purchasePriceCents * quantity);
  return reported;
}

export function processHoldings(simplefinAccounts: SimplefinAccount[]): HoldingRow[] {
  const rows: HoldingRow[] = [];

  for (const account of simplefinAccounts) {
    for (const holding of account.holdings ?? []) {
      const quantity = holding.shares ? Number(holding.shares) : 0;
      const currentValue = holding.market_value ? simplefinAmountToCents(holding.market_value) : null;
      if (!quantity && !currentValue) continue; // no position, nothing to show

      const symbol = holding.symbol?.trim() || null;
      rows.push({
        externalAccountId: account.id,
        securityId: simplefinSecurityId(holding),
        securityName: holding.description?.trim() || symbol || "Unknown Security",
        ticker: symbol,
        quantity,
        costBasis: resolveCostBasisCents(holding, quantity),
        currentValue: currentValue ?? 0,
        type: inferHoldingType(symbol),
        currency: holding.currency?.trim() || account.currency,
      });
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// 2. applyToDb
// ---------------------------------------------------------------------------

async function applyToDb(
  db: LedgrDb,
  processed: ProcessedBatch,
  balances: AccountBalanceInfo[],
  holdings: HoldingRow[],
  connectionId: string,
  householdId: string,
): Promise<{ addedCount: number; modifiedCount: number }> {
  const now = new Date();
  const today = todayDateString();

  return withHousehold(householdId, async (tx) => {
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

    // Holdings are a full snapshot each sync (SimpleFIN has no delta/cursor
    // for positions) — replace this connection's rows outright, same as Plaid.
    const holdingAccountIds = accountRows.map((r) => r.id);
    if (holdingAccountIds.length) {
      await tx.delete(investmentHoldings).where(inArray(investmentHoldings.accountId, holdingAccountIds));
    }

    const holdingRowsWithAccount = holdings
      .map((h) => ({ h, internalAccountId: externalToInternal.get(h.externalAccountId) }))
      .filter((x): x is { h: HoldingRow; internalAccountId: string } => !!x.internalAccountId);

    if (holdingRowsWithAccount.length) {
      await tx.insert(investmentHoldings).values(
        holdingRowsWithAccount.map(({ h, internalAccountId }) => ({
          id: uuid(),
          accountId: internalAccountId,
          plaidSecurityId: h.securityId,
          securityName: h.securityName,
          ticker: h.ticker,
          quantity: h.quantity,
          costBasis: h.costBasis,
          currentValue: h.currentValue,
          type: h.type,
          sector: null,
          currency: h.currency,
          asOfDate: today,
        })),
      );

      await tx.insert(holdingsHistory).values(
        holdingRowsWithAccount.map(({ h, internalAccountId }) => ({
          id: uuid(),
          accountId: internalAccountId,
          plaidSecurityId: h.securityId,
          securityName: h.securityName,
          ticker: h.ticker,
          quantity: h.quantity,
          value: h.currentValue,
          date: today,
        })),
      ).onConflictDoNothing();
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
  }, db);
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

async function backfillInstitutionLogo(
  db: LedgrDb,
  connectionId: string,
  householdId: string,
  syncedAccounts: SimplefinAccount[],
  connections: SimplefinConnection[] | null | undefined,
): Promise<void> {
  if (syncedAccounts.length === 0) return;

  const [existing] = await db
    .select({ connectionId: institutionLogos.connectionId })
    .from(institutionLogos)
    .where(eq(institutionLogos.connectionId, connectionId))
    .limit(1);
  if (existing) return;

  // One SimpleFIN Access URL can span multiple institutions (a single
  // SimpleFIN Bridge session linking several banks under one shared
  // credential) — /accounts on that credential returns every account across
  // all of them, not just this connection's. applyToDb() already filters by
  // matching externalAccountId to what's registered under this
  // connectionId; do the same here rather than assuming syncedAccounts[0]
  // belongs to this institution, or the wrong org's domain (and icon) gets
  // cached for it.
  const registered = await withHousehold(householdId, (tx) =>
    tx
      .select({ externalAccountId: accounts.externalAccountId })
      .from(accounts)
      .where(and(eq(accounts.bankConnectionId, connectionId), isNull(accounts.deletedAt))),
  db);
  const registeredIds = new Set(registered.map((r) => r.externalAccountId));

  const account = syncedAccounts.find((a) => registeredIds.has(a.id));
  if (!account) return;

  const { domain } = resolveInstitution(account, connections);
  if (!domain) return;

  const logo = await fetchFaviconDataUri(domain);
  if (!logo) return;

  await db.insert(institutionLogos)
    .values({ id: uuid(), connectionId, logo })
    .onConflictDoNothing();
}

async function doSync(
  connectionId: string,
  householdId: string,
  db: LedgrDb,
): Promise<SyncResult> {
  const now = new Date();

  try {
    // Kept as its own short-lived transaction — not held open across the
    // SimpleFIN API round trip that follows.
    const initial = await withHousehold(householdId, async (tx) => {
      const [row] = await tx
        .select()
        .from(bankConnections)
        .where(and(eq(bankConnections.id, connectionId), eq(bankConnections.householdId, householdId)))
        .limit(1);

      if (!row) return null;

      const [lastSyncRow] = await tx
        .select({ syncedAt: syncLog.syncedAt })
        .from(syncLog)
        .where(eq(syncLog.connectionId, connectionId))
        .orderBy(desc(syncLog.syncedAt))
        .limit(1);

      return { connection: row, lastSync: lastSyncRow };
    }, db);

    if (!initial) {
      return { success: false, error: `SimpleFIN connection ${connectionId} not found` };
    }
    const { connection, lastSync } = initial;

    const accessUrl = decrypt(connection.credential);

    // Bound the poll to since-last-sync (with a 7-day lookback buffer, so
    // recently-pending transactions that changed amount/status get picked
    // back up). On first sync there's no "since" to anchor to — leaving
    // start-date unset here would let each SimpleFIN bridge apply its own
    // (usually short, ~7-day) default window, so request a full year of
    // history explicitly instead.
    const INITIAL_SYNC_LOOKBACK_DAYS = 365;
    const startDate = lastSync
      ? Math.floor(lastSync.syncedAt.getTime() / 1000) - 7 * 24 * 60 * 60
      : Math.floor(now.getTime() / 1000) - INITIAL_SYNC_LOOKBACK_DAYS * 24 * 60 * 60;

    const raw = await simplefinRequest(accessUrl, "/accounts", {
      pending: 1,
      version: 2,
      "start-date": startDate,
    });
    const parsed = SimplefinAccountsResponseSchema.parse(raw);

    const processed = processBatch(parsed.accounts);
    const balances = balancesFromAccounts(parsed.accounts);
    const holdings = processHoldings(parsed.accounts);
    const counts = await applyToDb(db, processed, balances, holdings, connectionId, householdId);

    // Backfill (non-fatal): connections created before icon caching existed,
    // or whose initial favicon fetch failed, pick up an icon lazily here —
    // reusing the institution data this sync already fetched rather than
    // requiring a reconnect.
    try {
      await backfillInstitutionLogo(db, connectionId, householdId, parsed.accounts, parsed.connections);
    } catch (logoError) {
      console.error("Institution logo backfill failed for connection", JSON.stringify(connectionId), logoError);
    }

    // Auto-categorize newly synced transactions (non-fatal) — mirrors plaid/sync.ts.
    try {
      await categorizeSyncedTransactions(connectionId, householdId, db);
    } catch (catError) {
      console.error("Categorization failed for connection", JSON.stringify(connectionId), catError);
    }

    // Detect self-transfers between the household's own accounts (non-fatal).
    try {
      await applyTransferDetection(householdId, db);
    } catch (transferError) {
      console.error("Transfer detection failed for connection", JSON.stringify(connectionId), transferError);
    }

    // Detect recurring bills/income from transaction patterns (non-fatal) —
    // SimpleFIN has no recurring-transactions API of its own, unlike Plaid.
    try {
      await applyRecurringDetection(householdId, db);
    } catch (recurringError) {
      console.error("Recurring detection failed for connection", JSON.stringify(connectionId), recurringError);
    }

    // AI categorization and merchant/logo resolution — fire-and-forget, same
    // pattern as syncInvestments in actions/sync.ts. Both are household-scoped
    // (not just this connection's transactions) and internally coalesced, so
    // it's safe for several connections to trigger them concurrently without
    // blocking the sync response on LLM round-trips.
    import("@/lib/ai/categorize")
      .then(({ categorizeWithAi }) => categorizeWithAi(householdId, db))
      .catch((aiError) => {
        console.error("AI categorization failed for connection", JSON.stringify(connectionId), aiError);
      });

    import("@/lib/ai/resolve-merchants")
      .then(({ resolveMerchantLogos }) => resolveMerchantLogos(householdId, db))
      .catch((merchantError) => {
        console.error("AI merchant resolution failed for connection", JSON.stringify(connectionId), merchantError);
      });

    return {
      success: true,
      addedCount: counts.addedCount,
      modifiedCount: counts.modifiedCount,
      syncedAt: now.toISOString(),
    };
  } catch (err: unknown) {
    const { status, errorCode, message } = classifyPollError(err);

    await withHousehold(householdId, async (tx) => {
      await tx.update(bankConnections)
        .set({ status, errorCode, updatedAt: now })
        .where(eq(bankConnections.id, connectionId));

      await tx.insert(syncLog)
        .values({
          id: uuid(),
          connectionId,
          error: message,
          syncedAt: now,
        });
    }, db);

    return { success: false, error: message };
  }
}
