/**
 * How much of a month's spending has no category yet.
 *
 * Two consumers, and they need different denominators:
 *
 *   - the dashboard review nudge quotes `amount` and `pct` (share of *total*
 *     spend), because that is the size of the problem;
 *   - the spending donut renders over `categorized`, because "Uncategorized"
 *     is the absence of data rather than a peer category — and once it is
 *     removed from the series every remaining slice is a percentage of
 *     `categorized`, not of `total`. Labelling those as a share of spending
 *     would overstate every category on the chart.
 *
 * Both are returned so neither caller has to re-derive the other's.
 */

export interface SpendingSlice {
  /** null identifies the uncategorized bucket (see lib/spending-helpers.ts). */
  categoryId: string | null;
  /** Absolute spend in cents. */
  total: number;
}

export interface UncategorizedShare {
  /** Uncategorized spend, in cents. */
  amount: number;
  /** All spend for the period, in cents, uncategorized included. */
  total: number;
  /** Spend that has a category — the donut's denominator. */
  categorized: number;
  /** `amount` as a percentage of `total`, to one decimal place. */
  pct: number;
}

export function uncategorizedShare(rows: SpendingSlice[]): UncategorizedShare | null {
  let amount = 0;
  let total = 0;

  for (const r of rows) {
    // Spending aggregates are absolute values, so a negative is a data fault
    // rather than a refund. Skipping keeps it out of the denominator instead
    // of letting it inflate the reported share.
    if (r.total < 0) return null;
    total += r.total;
    if (r.categoryId === null) amount += r.total;
  }

  // Nothing uncategorized, or an empty month: no problem to report.
  //
  // This also rules out a zero denominator below without a second check.
  // Negative rows returned early, so every row is >= 0 and `total` is a sum
  // that includes `amount` — meaning `amount > 0` implies `total > 0`. A
  // `total <= 0` guard here would be unreachable, which is exactly what
  // mutation testing flagged: negating it changed no behaviour.
  if (amount <= 0) return null;

  return {
    amount,
    total,
    categorized: total - amount,
    pct: Math.round((amount / total) * 1000) / 10,
  };
}
