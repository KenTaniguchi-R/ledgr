export function centsToDisplay(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function displayToCents(display: number): number {
  return Math.round(display * 100);
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
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const parsed = Number(cleaned);
  if (Number.isNaN(parsed)) return null;
  return Math.round(parsed * 100);
}
