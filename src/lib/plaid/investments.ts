import { v4 as uuid } from "uuid";
import type { PlaidApi } from "plaid";
import type { PlaidHolding, PlaidSecurity, PlaidInvestmentTxn } from "./schemas";
import { mapSecurityType, PlaidHoldingsResponseSchema, PlaidInvestmentTxnsResponseSchema } from "./schemas";
import { retryWithBackoff } from "./utils";
import { todayDateString } from "@/lib/date-utils";

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
