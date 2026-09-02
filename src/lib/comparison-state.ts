export type ComparisonState =
  | { kind: "new" }
  | { kind: "flat"; percent: number }
  | { kind: "up"; percent: number }
  | { kind: "down"; percent: number };

/** Below this, a move is noise rather than a trend. */
const FLAT_THRESHOLD_PERCENT = 0.5;

/**
 * How this period compares with the baseline.
 *
 * A missing or zero baseline is reported as `new` rather than folded in with
 * "no change": the Change column used to render an empty cell for both, so a
 * category appearing for the first time was indistinguishable from one that had
 * not moved.
 */
export function comparisonState(current: number, previous: number | null): ComparisonState {
  if (previous === null || previous === 0) return { kind: "new" };

  const percent = ((current - previous) / previous) * 100;
  if (Math.abs(percent) < FLAT_THRESHOLD_PERCENT) return { kind: "flat", percent };
  return { kind: percent > 0 ? "up" : "down", percent };
}
