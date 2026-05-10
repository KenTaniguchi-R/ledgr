import { v4 as uuid } from "uuid";
import type { PlaidApi } from "plaid";
import type { PlaidHolding, PlaidSecurity, PlaidInvestmentTxn } from "./schemas";
import { mapSecurityType, PlaidHoldingsResponseSchema, PlaidInvestmentTxnsResponseSchema } from "./schemas";
import { retryWithBackoff } from "./utils";
import {
  extractPlaidErrorCode,
  REAUTH_ERROR_CODES,
  TRANSIENT_ERROR_CODES,
  SKIP_ERROR_CODES,
} from "./utils";
import { getPlaidClient } from "./client";
import { decrypt } from "@/lib/encryption";
import { todayDateString } from "@/lib/date-utils";
import { eq, inArray } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  investmentHoldings,
  holdingsHistory,
  investmentTransactions,
  accounts,
  plaidItems,
} from "@/db/schema";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HoldingRow {
  id: string;
  accountId: string;
  plaidSecurityId: string;
  securityName: string;
  ticker: string | null;
  quantity: number;
  costBasis: number | null;
  currentValue: number;
  type: string;
  sector: string | null;
  currency: string;
  asOfDate: string;
}

export interface InvestmentTxnRow {
  id: string;
  accountId: string;
  plaidInvestmentTransactionId: string;
  securityName: string | null;
  ticker: string | null;
  type: string;
  quantity: number;
  price: number;
  amount: number;
  fees: number;
  date: string;
}

export interface InvestmentSyncResult {
  success: boolean;
  skipped?: boolean;
  holdingsUpserted?: number;
  txnsInserted?: number;
  error?: string;
}

const MAX_INV_TXN_PAGES = 50;

// ─── Stage 1: Fetch ─────────────────────────────────────────────────────────

export async function fetchHoldings(
  client: PlaidApi,
  accessToken: string,
): Promise<{ holdings: PlaidHolding[]; securities: PlaidSecurity[] }> {
  const response = await retryWithBackoff(() =>
    client.investmentsHoldingsGet({ access_token: accessToken })
  );
  const parsed = PlaidHoldingsResponseSchema.parse(response.data);
  return { holdings: parsed.holdings, securities: parsed.securities };
}

export async function fetchAllInvestmentTransactionPages(
  client: PlaidApi,
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<{ transactions: PlaidInvestmentTxn[]; securities: PlaidSecurity[] }> {
  const allTxns: PlaidInvestmentTxn[] = [];
  const allSecurities = new Map<string, PlaidSecurity>();
  let offset = 0;

  for (let page = 0; page < MAX_INV_TXN_PAGES; page++) {
    const response = await retryWithBackoff(() =>
      client.investmentsTransactionsGet({
        access_token: accessToken,
        start_date: startDate,
        end_date: endDate,
        options: { offset },
      })
    );
    const parsed = PlaidInvestmentTxnsResponseSchema.parse(response.data);

    allTxns.push(...parsed.investment_transactions);
    for (const sec of parsed.securities) {
      allSecurities.set(sec.security_id, sec);
    }

    offset += parsed.investment_transactions.length;
    if (offset >= parsed.total_investment_transactions) break;
  }

  return { transactions: allTxns, securities: Array.from(allSecurities.values()) };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function safeCents(value: number): number {
  const cents = Math.round(value * 100);
  return cents === 0 ? 0 : cents;
}

function buildSecurityMap(securities: PlaidSecurity[]): Map<string, PlaidSecurity> {
  const map = new Map<string, PlaidSecurity>();
  for (const sec of securities) {
    map.set(sec.security_id, sec);
  }
  return map;
}

// ─── Stage 2: Process (Pure Functions) ──────────────────────────────────────

export function processHoldings(
  rawHoldings: PlaidHolding[],
  securities: PlaidSecurity[],
  householdId: string,
  plaidToInternalAccount: Map<string, string>,
): HoldingRow[] {
  const securityMap = buildSecurityMap(securities);
  const today = todayDateString();
  const rows: HoldingRow[] = [];

  for (const holding of rawHoldings) {
    const internalAccountId = plaidToInternalAccount.get(holding.account_id);
    if (!internalAccountId) continue;

    const security = securityMap.get(holding.security_id);
    if (!security) continue;

    rows.push({
      id: uuid(),
      accountId: internalAccountId,
      plaidSecurityId: holding.security_id,
      securityName: security.name ?? "Unknown Security",
      ticker: security.ticker_symbol ?? null,
      quantity: holding.quantity,
      costBasis: holding.cost_basis !== null ? safeCents(holding.cost_basis) : null,
      currentValue: safeCents(holding.institution_value),
      type: mapSecurityType(security.type),
      sector: security.sector ?? null,
      currency: holding.iso_currency_code ?? "USD",
      asOfDate: today,
    });
  }

  return rows;
}

const VALID_INV_TXN_TYPES = new Set(["buy", "sell", "dividend", "transfer", "fee"]);

function mapInvestmentTxnType(plaidType: string): string {
  return VALID_INV_TXN_TYPES.has(plaidType) ? plaidType : "other";
}

export function processInvestmentTransactions(
  rawTxns: PlaidInvestmentTxn[],
  securities: PlaidSecurity[],
  plaidToInternalAccount: Map<string, string>,
): InvestmentTxnRow[] {
  const securityMap = buildSecurityMap(securities);
  const rows: InvestmentTxnRow[] = [];

  for (const txn of rawTxns) {
    const internalAccountId = plaidToInternalAccount.get(txn.account_id);
    if (!internalAccountId) continue;

    const security = txn.security_id ? securityMap.get(txn.security_id) : null;

    rows.push({
      id: uuid(),
      accountId: internalAccountId,
      plaidInvestmentTransactionId: txn.investment_transaction_id,
      securityName: security?.name ?? txn.name,
      ticker: security?.ticker_symbol ?? null,
      type: mapInvestmentTxnType(txn.type),
      quantity: txn.quantity,
      price: safeCents(txn.price),
      amount: safeCents(txn.amount),
      fees: safeCents(txn.fees ?? 0),
      date: txn.date,
    });
  }

  return rows;
}

// ─── Stage 3: Apply (Atomic DB Write) ──────────────────────────────────────

export function applyInvestmentsToDb(
  db: LedgrDb,
  holdingRows: HoldingRow[],
  txnRows: InvestmentTxnRow[],
  itemId: string,
  householdId: string,
): { holdingsUpserted: number; txnsInserted: number } {
  let holdingsUpserted = 0;
  let txnsInserted = 0;
  const today = todayDateString();

  db.transaction((tx) => {
    // Get account IDs belonging to this plaid item
    const itemAccounts = tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.plaidItemId, itemId))
      .all();
    const itemAccountIds = itemAccounts.map((a) => a.id);

    // Holdings: full replace
    if (itemAccountIds.length > 0) {
      tx.delete(investmentHoldings)
        .where(inArray(investmentHoldings.accountId, itemAccountIds))
        .run();
    }

    for (const row of holdingRows) {
      tx.insert(investmentHoldings)
        .values({
          id: row.id,
          accountId: row.accountId,
          plaidSecurityId: row.plaidSecurityId,
          securityName: row.securityName,
          ticker: row.ticker,
          quantity: row.quantity,
          costBasis: row.costBasis,
          currentValue: row.currentValue,
          type: row.type as "stock" | "etf" | "mutual_fund" | "bond" | "crypto" | "cash" | "other",
          sector: row.sector,
          currency: row.currency,
          asOfDate: row.asOfDate,
        })
        .run();
      holdingsUpserted++;
    }

    // Investment transactions: INSERT OR IGNORE
    for (const row of txnRows) {
      const result = tx
        .insert(investmentTransactions)
        .values({
          id: row.id,
          accountId: row.accountId,
          plaidInvestmentTransactionId: row.plaidInvestmentTransactionId,
          securityName: row.securityName,
          ticker: row.ticker,
          type: row.type as "buy" | "sell" | "dividend" | "transfer" | "fee" | "other",
          quantity: row.quantity,
          price: row.price,
          amount: row.amount,
          fees: row.fees,
          date: row.date,
        })
        .onConflictDoNothing()
        .run();
      if (result.changes > 0) txnsInserted++;
    }

    // Snapshot holdings to history
    for (const row of holdingRows) {
      tx.insert(holdingsHistory)
        .values({
          id: uuid(),
          accountId: row.accountId,
          plaidSecurityId: row.plaidSecurityId,
          securityName: row.securityName,
          ticker: row.ticker,
          quantity: row.quantity,
          value: row.currentValue,
          date: today,
        })
        .onConflictDoNothing()
        .run();
    }
  });

  return { holdingsUpserted, txnsInserted };
}

// ─── Snapshot Holdings (Daily Safety Net) ───────────────────────────────────

export function snapshotHoldings(dbInstance: LedgrDb = defaultDb): void {
  const today = todayDateString();
  const allHoldings = dbInstance.select().from(investmentHoldings).all();

  for (const h of allHoldings) {
    dbInstance
      .insert(holdingsHistory)
      .values({
        id: uuid(),
        accountId: h.accountId,
        plaidSecurityId: h.plaidSecurityId,
        securityName: h.securityName,
        ticker: h.ticker,
        quantity: h.quantity,
        value: h.currentValue,
        date: today,
      })
      .onConflictDoNothing()
      .run();
  }
}

// ─── Sync Orchestrator ──────────────────────────────────────────────────────

const activeInvestmentSyncs = new Map<string, Promise<InvestmentSyncResult>>();

export async function syncInvestments(
  itemId: string,
  householdId: string,
  db: LedgrDb,
): Promise<InvestmentSyncResult> {
  const existing = activeInvestmentSyncs.get(itemId);
  if (existing) return existing;

  const promise = doInvestmentSync(itemId, householdId, db);
  activeInvestmentSyncs.set(itemId, promise);

  try {
    return await promise;
  } finally {
    activeInvestmentSyncs.delete(itemId);
  }
}

async function doInvestmentSync(
  itemId: string,
  householdId: string,
  db: LedgrDb,
): Promise<InvestmentSyncResult> {
  const item = db
    .select({ accessToken: plaidItems.accessToken })
    .from(plaidItems)
    .where(eq(plaidItems.id, itemId))
    .get();

  if (!item) {
    return { success: false, error: "Item not found" };
  }

  const accessToken = decrypt(item.accessToken);
  const client = getPlaidClient();

  // Build account map
  const itemAccounts = db
    .select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId })
    .from(accounts)
    .where(eq(accounts.plaidItemId, itemId))
    .all();

  const plaidToInternalAccount = new Map<string, string>();
  for (const acc of itemAccounts) {
    if (acc.plaidAccountId) {
      plaidToInternalAccount.set(acc.plaidAccountId, acc.id);
    }
  }

  try {
    // Fetch holdings
    const { holdings: rawHoldings, securities: holdingSecurities } =
      await fetchHoldings(client, accessToken);

    // Fetch investment transactions (24 months)
    const endDate = todayDateString();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 24);
    const startDateStr = startDate.toISOString().split("T")[0];

    const { transactions: rawTxns, securities: txnSecurities } =
      await fetchAllInvestmentTransactionPages(client, accessToken, startDateStr, endDate);

    // Merge securities from both responses
    const allSecurities = new Map<string, PlaidSecurity>();
    for (const sec of holdingSecurities) allSecurities.set(sec.security_id, sec);
    for (const sec of txnSecurities) allSecurities.set(sec.security_id, sec);
    const mergedSecurities = Array.from(allSecurities.values());

    // Process
    const holdingRows = processHoldings(rawHoldings, mergedSecurities, householdId, plaidToInternalAccount);
    const txnRows = processInvestmentTransactions(rawTxns, mergedSecurities, plaidToInternalAccount);

    // Apply
    const result = applyInvestmentsToDb(db, holdingRows, txnRows, itemId, householdId);

    return {
      success: true,
      holdingsUpserted: result.holdingsUpserted,
      txnsInserted: result.txnsInserted,
    };
  } catch (err: unknown) {
    const errorCode = extractPlaidErrorCode(err);

    if (errorCode && SKIP_ERROR_CODES.has(errorCode)) {
      return { success: true, skipped: true };
    }

    if (errorCode && REAUTH_ERROR_CODES.has(errorCode)) {
      db.update(plaidItems)
        .set({ status: "reauth_required" })
        .where(eq(plaidItems.id, itemId))
        .run();
      return { success: false, error: `Reauth required: ${errorCode}` };
    }

    if (errorCode && TRANSIENT_ERROR_CODES.has(errorCode)) {
      db.update(plaidItems)
        .set({ status: "error" })
        .where(eq(plaidItems.id, itemId))
        .run();
      return { success: false, error: `Transient error: ${errorCode}` };
    }

    return { success: false, error: String(err) };
  }
}
