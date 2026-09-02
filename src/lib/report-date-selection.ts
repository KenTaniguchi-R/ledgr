/**
 * Which date range the Reports page is showing.
 *
 * The page and its filter bar both need this answer, and they used to derive it
 * separately. They disagreed on a bare `/reports`: the bar defaulted to the 3M
 * preset and rendered "Last 3 months", while the page read the absent params as
 * all-time and suppressed the comparison column. Same URL, same data, two
 * different UIs — so the resolution lives here and both read it.
 */

/** Applied when the URL carries no preset and no explicit from/to pair. */
export const DEFAULT_REPORT_PRESET = "3M";

export interface ReportDateSelection {
  /** A preset id, or `null` when the user picked an explicit from/to range. */
  effectivePreset: string | null;
  /** No lower bound, so there is no previous period to compare against. */
  isAllTime: boolean;
  /** Presets shift by calendar months; custom ranges shift by day count. */
  isPreset: boolean;
}

export function resolveReportDateSelection(params: {
  from?: string | null;
  to?: string | null;
  preset?: string | null;
}): ReportDateSelection {
  const preset = params.preset ?? null;
  // Both bounds are required: a lone `from` is not a range, so it falls back to
  // the default rather than resolving to a half-open custom selection.
  const hasCustomRange = Boolean(params.from && params.to && !preset);
  const effectivePreset = preset ?? (hasCustomRange ? null : DEFAULT_REPORT_PRESET);

  return {
    effectivePreset,
    isAllTime: effectivePreset === "all",
    isPreset: effectivePreset !== null,
  };
}
