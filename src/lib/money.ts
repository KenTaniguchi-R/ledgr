export function centsToDisplay(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function displayToCents(display: number): number {
  return Math.round(display * 100);
}

const FLIP_SIGN_TYPES = new Set(["checking", "savings", "other"]);

export function normalizeAmount(amountCents: number, accountType: string): number {
  const shouldFlip = FLIP_SIGN_TYPES.has(accountType);
  const normalized = shouldFlip ? -amountCents : amountCents;
  return normalized === 0 ? 0 : normalized;
}

export function plaidAmountToCents(plaidAmount: number | null | undefined): number | null {
  if (plaidAmount === null || plaidAmount === undefined) return null;
  return Math.round(plaidAmount * 100);
}
