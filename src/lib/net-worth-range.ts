import { formatDateShort } from "./date-utils";

/**
 * Which net-worth ranges the household actually has the history to answer.
 *
 * The range control used to offer six months regardless, so a household whose
 * balance history begins two days ago got a chart that was almost entirely
 * hatched fill and dashed line — nearly all of its ink spent saying "we don't
 * know". The data was reported honestly; the control was writing cheques the
 * data could not cash.
 *
 * This does NOT replace the partial-coverage treatment. Wherever a partial
 * region is plotted it must still render dashed and hatched — gating the
 * control is what keeps those regions off-screen, not permission to stop
 * marking them.
 */

export const RANGES = ["1M", "3M", "6M", "1Y", "All"] as const;
export type NetWorthRange = (typeof RANGES)[number];

/** Months back from `asOf` each range covers. "All" reaches back forever. */
const MONTHS_BACK: Record<NetWorthRange, number | null> = {
  "1M": 1,
  "3M": 3,
  "6M": 6,
  "1Y": 12,
  All: null,
};

export interface RangeSupport {
  range: NetWorthRange;
  /** Whether every point in this window has a known balance for every account. */
  supported: boolean;
  /** Why it is unavailable, for a tooltip. Null when supported. */
  reason: string | null;
  /** The widest supported range — what the hero should open on. */
  recommended: boolean;
}

function windowStart(range: NetWorthRange, asOf: Date): Date | null {
  const months = MONTHS_BACK[range];
  if (months === null) return null; // "All" has no start
  const start = new Date(asOf);
  start.setUTCMonth(start.getUTCMonth() - months);
  return start;
}

/**
 * @param fullCoverageSince ISO date on which every tracked account first had a
 *   known balance, or null when history is complete for all of it.
 */
export function rangeSupport(
  fullCoverageSince: string | null,
  asOf: Date,
): RangeSupport[] {
  const coverageStart = fullCoverageSince ? new Date(`${fullCoverageSince}T00:00:00Z`) : null;

  const evaluated = RANGES.map((range) => {
    if (coverageStart === null) {
      return { range, supported: true, reason: null };
    }

    const start = windowStart(range, asOf);
    // "All" reaches back to the beginning, so it is supported only when
    // coverage does too — which is the `coverageStart === null` case above.
    const supported = start !== null && start.getTime() >= coverageStart.getTime();

    return {
      range,
      supported,
      reason: supported
        ? null
        : `Needs balance history before ${formatDateShort(fullCoverageSince!)}`,
    };
  });

  // The widest supported range, so the reader sees as much honest history as
  // exists — just not more than exists. When nothing qualifies, nothing is
  // recommended and the caller falls back to plotting the covered span.
  let recommendedIndex = -1;
  for (let i = 0; i < evaluated.length; i++) {
    if (evaluated[i].supported) recommendedIndex = i;
  }

  return evaluated.map((r, i) => ({ ...r, recommended: i === recommendedIndex }));
}
