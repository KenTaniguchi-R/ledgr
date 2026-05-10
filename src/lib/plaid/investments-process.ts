import { v4 as uuid } from "uuid";
import type { PlaidHolding, PlaidSecurity, PlaidInvestmentTxn } from "./schemas";
import { mapSecurityType } from "./schemas";
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

// ─── Helpers ────────────────────────────────────────────────────────────────

export function safeCents(value: number): number {
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

const VALID_INV_TXN_TYPES = new Set(["buy", "sell", "dividend", "transfer", "fee"]);

function mapInvestmentTxnType(plaidType: string): string {
  return VALID_INV_TXN_TYPES.has(plaidType) ? plaidType : "other";
}

// ─── Process Functions (Pure) ───────────────────────────────────────────────

export function processHoldings(
  rawHoldings: PlaidHolding[],
  securities: PlaidSecurity[],
  _householdId: string,
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
