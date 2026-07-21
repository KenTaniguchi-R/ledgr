// Pure helpers for period-over-period deltas shown on the dashboard.
// All money values are integer cents, per lib/money.ts conventions.

export interface TrendDelta {
  diff: number;
  /** Percent change from first to last point; null when the base is zero. */
  pct: number | null;
}

/** Percent change vs the previous magnitude; null when previous is zero. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Net saved as a percentage of income; null when there is no income. */
export function savingsRatePct(summary: {
  monthlyIncome: number;
  monthlyNet: number;
}): number | null {
  if (summary.monthlyIncome <= 0) return null;
  return (summary.monthlyNet / summary.monthlyIncome) * 100;
}

/** Change across a series (first → last); null when under two points. */
export function trendDelta(values: number[]): TrendDelta | null {
  if (values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  return { diff: last - first, pct: pctChange(last, first) };
}
