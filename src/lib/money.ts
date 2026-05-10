export function centsToDisplay(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function displayToCents(display: number): number {
  return Math.round(display * 100);
}

export function plaidAmountToCents(plaidAmount: number | null | undefined): number | null {
  if (plaidAmount === null || plaidAmount === undefined) return null;
  return Math.round(plaidAmount * 100);
}
