// Coverage-boundary helpers for the net-worth series.
//
// A net-worth point is only net worth when every tracked account has a known
// balance on that date. Balance history is uneven: carry-forward (#68) fills
// gaps *between* an account's snapshots, but an account whose first-ever
// snapshot lands mid-window contributes $0 to every earlier point, because
// there is nothing to carry backward. Summing anyway produces a partial sum
// that looks like net worth and moves like a cliff the moment the missing
// accounts appear.
//
// These helpers let the UI say which stretch of a series is a partial sum, and
// stop it computing a percentage across the boundary.

import { trendDelta, type TrendDelta } from "./stat-delta";

export interface CoverageAware {
  date: string;
  netWorth: number;
  coveredAccounts?: number;
  totalAccounts?: number;
}

export interface CoverageBoundary {
  /** First index where every account is covered; -1 when that never happens. */
  index: number;
  /** Date at that index, or null. */
  date: string | null;
  /** True when at least one plotted point is a partial sum. */
  hasPartial: boolean;
  /** Fewest accounts covered anywhere in the partial span; null when none. */
  minCovered: number | null;
  /** Most accounts covered within the partial span; null when none. */
  maxPartialCovered: number | null;
  /** Accounts tracked overall, from the last point that reports it. */
  totalAccounts: number | null;
}

function isPartial(p: CoverageAware): boolean {
  // Points without coverage data (the reports series) are taken at face value —
  // absence of the field is not evidence of a gap.
  return (
    p.coveredAccounts !== undefined &&
    p.totalAccounts !== undefined &&
    p.coveredAccounts < p.totalAccounts
  );
}

export function coverageBoundary(points: CoverageAware[]): CoverageBoundary {
  if (points.length === 0) {
    return { index: -1, date: null, hasPartial: false, minCovered: null, maxPartialCovered: null, totalAccounts: null };
  }

  const partials = points.filter(isPartial);
  const covereds = partials.map((p) => p.coveredAccounts!);

  const total = points.reduce<number | null>(
    (acc, p) => (p.totalAccounts !== undefined ? p.totalAccounts : acc),
    null
  );

  if (partials.length === 0) {
    return { index: 0, date: points[0].date, hasPartial: false, minCovered: null, maxPartialCovered: null, totalAccounts: total };
  }

  const index = points.findIndex((p) => !isPartial(p));

  return {
    index,
    date: index === -1 ? null : points[index].date,
    hasPartial: true,
    minCovered: Math.min(...covereds),
    maxPartialCovered: Math.max(...covereds),
    totalAccounts: total,
  };
}

/**
 * Change across the fully covered span only.
 *
 * Null when fewer than two fully covered points exist — a delta measured from a
 * partial baseline reports accounts appearing, not money arriving. That is
 * exactly the "+2430.7% past 6 months" the dashboard used to show.
 */
export function coveredTrendDelta(points: CoverageAware[]): TrendDelta | null {
  const { index } = coverageBoundary(points);
  if (index === -1) return null;
  return trendDelta(points.slice(index).map((p) => p.netWorth));
}
