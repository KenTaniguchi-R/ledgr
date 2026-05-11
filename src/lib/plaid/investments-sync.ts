import type { PlaidApi } from "plaid";
import type { PlaidSecurity } from "./schemas";
import { retryWithBackoff } from "./utils";
import {
  extractPlaidErrorCode,
  REAUTH_ERROR_CODES,
  TRANSIENT_ERROR_CODES,
  SKIP_ERROR_CODES,
} from "./utils";
import { PlaidHoldingsResponseSchema, PlaidInvestmentTxnsResponseSchema } from "./schemas";
import { getPlaidClient } from "./client";
import { decrypt } from "@/lib/encryption";
import { todayDateString } from "@/lib/date-utils";
import { eq, and } from "drizzle-orm";
import type { LedgrDb } from "@/db";
import { accounts, plaidItems } from "@/db/schema";
import type { PlaidHolding, PlaidInvestmentTxn } from "./schemas";
import type { InvestmentSyncResult } from "./investments-process";
import { processHoldings, processInvestmentTransactions } from "./investments-process";
import { applyInvestmentsToDb } from "./investments-apply";

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
  const [item] = await db
    .select({ accessToken: plaidItems.accessToken })
    .from(plaidItems)
    .where(and(eq(plaidItems.id, itemId), eq(plaidItems.householdId, householdId)))
    .limit(1);

  if (!item) {
    return { success: false, error: "Item not found" };
  }

  const accessToken = decrypt(item.accessToken);
  const client = getPlaidClient();

  const itemAccounts = await db
    .select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId })
    .from(accounts)
    .where(eq(accounts.plaidItemId, itemId));

  const plaidToInternalAccount = new Map<string, string>();
  for (const acc of itemAccounts) {
    if (acc.plaidAccountId) {
      plaidToInternalAccount.set(acc.plaidAccountId, acc.id);
    }
  }

  try {
    const { holdings: rawHoldings, securities: holdingSecurities } =
      await fetchHoldings(client, accessToken);

    const endDate = todayDateString();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 24);
    const startDateStr = startDate.toISOString().split("T")[0];

    const { transactions: rawTxns, securities: txnSecurities } =
      await fetchAllInvestmentTransactionPages(client, accessToken, startDateStr, endDate);

    const allSecurities = new Map<string, PlaidSecurity>();
    for (const sec of holdingSecurities) allSecurities.set(sec.security_id, sec);
    for (const sec of txnSecurities) allSecurities.set(sec.security_id, sec);
    const mergedSecurities = Array.from(allSecurities.values());

    const holdingRows = processHoldings(rawHoldings, mergedSecurities, householdId, plaidToInternalAccount);
    const txnRows = processInvestmentTransactions(rawTxns, mergedSecurities, plaidToInternalAccount);

    const result = await applyInvestmentsToDb(db, holdingRows, txnRows, itemId);

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
      await db.update(plaidItems)
        .set({ status: "reauth_required" })
        .where(eq(plaidItems.id, itemId));
      return { success: false, error: `Reauth required: ${errorCode}` };
    }

    if (errorCode && TRANSIENT_ERROR_CODES.has(errorCode)) {
      await db.update(plaidItems)
        .set({ status: "error" })
        .where(eq(plaidItems.id, itemId));
      return { success: false, error: `Transient error: ${errorCode}` };
    }

    return { success: false, error: String(err) };
  }
}
