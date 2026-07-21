export function centsToDisplay(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
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

function trimZero(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

// Plaid convention: positive = money out, negative = money in (all account types).
// We flip universally so: negative = expense, positive = income.
export function normalizeAmount(amountCents: number, _accountType: string): number {
  return amountCents === 0 ? 0 : -amountCents;
}

export function plaidAmountToCents(plaidAmount: number | null | undefined): number | null {
  if (plaidAmount === null || plaidAmount === undefined) return null;
  return Math.round(plaidAmount * 100);
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
