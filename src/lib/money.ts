import { classifyAccountType } from "./account-utils";

export function centsToDisplay(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/**
 * A signed amount, always carrying its sign: "+$12.50", "-$12.50", "+$0.00".
 *
 * Intl already renders a minus for negatives, but never a plus for positives.
 * Where a figure is a delta rather than a quantity — a net, a gain/loss — the
 * leading "+" is what makes it read as one, so both signs are written here.
 */
export function centsToSignedDisplay(cents: number, currency = "USD"): string {
  const display = centsToDisplay(Math.abs(cents), currency);
  return cents < 0 ? `-${display}` : `+${display}`;
}

export function displayToCents(display: number): number {
  return Math.round(display * 100);
}

// Compact axis-label form: $128.3K, $1.2M, $840. Sign is preserved.
export function centsToCompact(cents: number): string {
  const dollars = cents / 100;
  const abs = Math.abs(dollars);
  const sign = dollars < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${trimZero((abs / 1_000_000).toFixed(1))}M`;
  if (abs >= 1_000) return `${sign}$${trimZero((abs / 1_000).toFixed(1))}K`;
  return `${sign}$${Math.round(abs)}`;
}

/**
 * Axis tick formatter chosen from how wide the plotted values actually are.
 *
 * `centsToCompact` rounds to one decimal of a thousand — $100 of resolution —
 * so a chart whose values span less than that renders every tick with the same
 * text. That happens whenever the visible window is short: a household whose
 * balance history starts a couple of days ago got four ticks all reading
 * "$52.9K".
 */
export function axisTickFormatter(valuesInCents: number[]): (cents: number) => string {
  if (valuesInCents.length === 0) return centsToCompact;

  const spread = Math.max(...valuesInCents) - Math.min(...valuesInCents);
  if (spread >= 10_000) return centsToCompact;

  // Narrow domain: whole dollars with separators, distinguishable without the
  // noise of cents on an axis.
  return (cents: number) =>
    `${cents < 0 ? "-" : ""}$${Math.round(Math.abs(cents) / 100).toLocaleString("en-US")}`;
}

function trimZero(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

// Plaid convention: positive = money out, negative = money in, for every
// account type alike. We flip universally so: negative = expense, positive =
// income. Deliberately takes no account type -- normalization does not depend
// on one, and a parameter implying otherwise is misleading.
export function normalizeAmount(amountCents: number): number {
  return amountCents === 0 ? 0 : -amountCents;
}

export function plaidAmountToCents(plaidAmount: number | null | undefined): number | null {
  if (plaidAmount === null || plaidAmount === undefined) return null;
  return Math.round(plaidAmount * 100);
}

// Account *balance* normalization — distinct from plaidAmountToCents, which is
// also used for transaction amounts and must not flip anything.
//
// Plaid docs, `balances.current`: "For credit and loan accounts, a positive
// balance indicates amount owed; negative indicates lender owes account
// holder." Ledgr stores owed as negative for every account type (see the
// currentBalance note in db/schema/accounts.ts), so liabilities get flipped.
export function plaidBalanceToCents(
  plaidAmount: number | null | undefined,
  accountType: string
): number | null {
  const cents = plaidAmountToCents(plaidAmount);
  if (cents === null) return null;
  if (classifyAccountType(accountType) !== "liability") return cents;
  // Guard the JS -0 gotcha: -0 breaks strict equality checks downstream.
  return cents === 0 ? 0 : -cents;
}

// SimpleFIN amounts are decimal strings, e.g. "-33293.43". Unlike Plaid's
// convention (positive = money out), SimpleFIN's positive = deposit/income
// already matches our normalizedAmount invariant — no sign flip needed at
// the call site.
export function simplefinAmountToCents(amountStr: string): number | null {
  if (amountStr.trim() === "") return null;
  const n = Number(amountStr);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

export function centsToInputDisplay(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function parseToCents(input: string): number | null {
  let s = input.trim();
  if (s === "") return null;
  let sign = 1;
  // Accounting negatives: (123.45)
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1).trim();
  }
  // Leading/trailing explicit sign
  if (s.startsWith("-")) {
    sign *= -1;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  s = s.replace(/[^0-9.,]/g, ""); // drop currency symbols/spaces
  if (s === "") return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  // The rightmost of . or , is the decimal separator; the other is a grouping sep.
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    normalized = s.replace(/,/g, "");
  } else {
    normalized = s.replace(/,/g, ""); // no decimal sep, only grouping
  }
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) return null;
  return sign * Math.round(parsed * 100);
}
