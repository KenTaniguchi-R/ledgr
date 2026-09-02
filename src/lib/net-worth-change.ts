/**
 * A percentage needs a base worth dividing by. Below $100 of opening net worth
 * the ratio stops describing the period and starts describing the base: a $5.15
 * opening balance turned a $534 gain into "+10381.3%", which was the headline
 * figure on the tile.
 */
export const MIN_BASE_FOR_PERCENT = 100_00;

export interface NetWorthChange {
  current: number;
  change: number;
  /** `null` when the opening balance is too small for a ratio to mean anything. */
  percent: number | null;
}

export function netWorthChange(points: readonly { netWorth: number }[]): NetWorthChange {
  if (points.length === 0) return { current: 0, change: 0, percent: null };

  const opening = points[0].netWorth;
  const current = points[points.length - 1].netWorth;
  const change = current - opening;

  // A single snapshot is not a period: "0%" would be a claim about a span the
  // data does not cover.
  const comparable = points.length > 1 && Math.abs(opening) >= MIN_BASE_FOR_PERCENT;
  return {
    current,
    change,
    percent: comparable ? (change / Math.abs(opening)) * 100 : null,
  };
}
