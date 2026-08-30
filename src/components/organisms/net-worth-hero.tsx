"use client";

import { useState, useTransition, useMemo } from "react";
import { NetWorthAreaChart } from "@/components/atoms/net-worth-area-chart";
import { DateRangeSelector } from "@/components/molecules/date-range-selector";
import { centsToDisplay } from "@/lib/money";
import { formatDateShort } from "@/lib/date-utils";
import { coverageBoundary, coveredTrendDelta } from "@/lib/net-worth-coverage";
import { rangeSupport, RANGES } from "@/lib/net-worth-range";
import { cn } from "@/lib/utils";
import type { NetWorthPoint } from "@/queries/dashboard";

const RANGE_LABELS: Record<string, string> = {
  "1M": "past month",
  "3M": "past 3 months",
  "6M": "past 6 months",
  "1Y": "past year",
  All: "all time",
};

interface NetWorthHeroProps {
  netWorth: number;
  initialHistory: NetWorthPoint[];
  initialRange?: string;
  /**
   * Date from which every account has a known balance, or null when history is
   * complete. Drives which ranges the control offers — see lib/net-worth-range.
   */
  fullCoverageSince?: string | null;
}

export function NetWorthHero({
  netWorth,
  initialHistory,
  initialRange,
  fullCoverageSince = null,
}: NetWorthHeroProps) {
  // Availability is fixed for a given household, so it is computed once rather
  // than per render. `asOf` only needs day precision here.
  const support = useMemo(
    () => rangeSupport(fullCoverageSince, new Date()),
    [fullCoverageSince],
  );

  // Open on the widest range the data can actually answer. When nothing
  // qualifies — coverage began within the last month — fall back to the
  // narrowest, which still renders its uncovered stretch dashed and hatched.
  const defaultRange =
    initialRange ?? support.find((r) => r.recommended)?.range ?? RANGES[0];

  const [range, setRange] = useState<string>(defaultRange);
  const [history, setHistory] = useState(initialHistory);
  const [isLoading, startTransition] = useTransition();

  // When coverage began too recently for even the narrowest range, plotting the
  // window anyway spends almost the whole chart on a stretch that is not net
  // worth. Show the covered span instead — the pre-coverage points are dropped
  // rather than silently un-marked, so nothing partial is ever drawn unmarked,
  // and the note below still says what is missing.
  const noRangeFits = !support.some((r) => r.supported);
  const fullBoundary = coverageBoundary(history);
  const trimmed =
    noRangeFits && fullBoundary.hasPartial && fullBoundary.index > 0
      ? history.slice(fullBoundary.index)
      : history;

  // Measured across the fully covered span only. A delta from a partial
  // baseline reports accounts appearing, not money arriving — that is what
  // produced the "+2430.7% past 6 months" this replaces.
  const delta = coveredTrendDelta(history);
  const coverage = coverageBoundary(trimmed);
  const trimmedTo = trimmed !== history ? fullBoundary : null;
  const [dollars, cents] = centsToDisplay(netWorth).split(".");

  function handleRangeChange(next: string) {
    setRange(next);
    startTransition(async () => {
      const res = await fetch(`/api/dashboard/net-worth?range=${next}`);
      setHistory(await res.json());
    });
  }

  return (
    <section aria-label="Net worth" className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Net worth</p>
          <div className="flex flex-wrap items-baseline gap-3 mt-0.5">
            <span className="text-4xl font-semibold tracking-tight tabular-nums">
              {dollars}
              {cents !== undefined && (
                <span className="text-2xl text-muted-foreground font-medium">.{cents}</span>
              )}
            </span>
            {delta && (
              <span
                className={cn(
                  "text-sm font-semibold rounded-full px-2.5 py-0.5 whitespace-nowrap",
                  delta.diff === 0
                    ? "text-muted-foreground bg-muted"
                    : delta.diff > 0
                      ? "text-positive bg-positive/10"
                      : "text-destructive bg-destructive/10",
                )}
              >
                {/* An arrow on a zero diff points somewhere the number doesn't. */}
                {delta.diff === 0 ? (
                  "No change"
                ) : (
                  <>
                    {delta.diff > 0 ? "↑" : "↓"} {centsToDisplay(Math.abs(delta.diff))}
                    {delta.pct !== null && ` (${Math.abs(delta.pct).toFixed(1)}%)`}
                  </>
                )}{" "}
                <span className="font-medium opacity-75">
                  {coverage.hasPartial
                    ? `since ${formatDateShort(coverage.date ?? "")}`
                    : (RANGE_LABELS[range] ?? range.toLowerCase())}
                </span>
              </span>
            )}
            {!delta && coverage.hasPartial && (
              <span className="text-sm font-medium rounded-full px-2.5 py-0.5 whitespace-nowrap text-muted-foreground bg-muted">
                {coverage.date
                  ? `full history since ${formatDateShort(coverage.date)}`
                  : "history incomplete"}
              </span>
            )}
          </div>
        </div>
        <DateRangeSelector value={range} onChange={handleRangeChange} support={support} />
      </div>
      <div className={cn("h-56 mt-3 transition-opacity", isLoading && "opacity-50")}>
        <NetWorthAreaChart
          mode="single"
          seriesName="Net worth"
          data={trimmed.map((p) => ({
            date: p.date,
            value: p.netWorth,
            coveredAccounts: p.coveredAccounts,
            totalAccounts: p.totalAccounts,
          }))}
        />
      </div>
      {trimmedTo && (
        <p className="mt-2 text-xs text-muted-foreground">
          Showing full history from {formatDateShort(trimmedTo.date ?? "")}. Earlier dates are
          omitted because only {trimmedTo.minCovered === trimmedTo.maxPartialCovered
            ? trimmedTo.minCovered
            : `${trimmedTo.minCovered}–${trimmedTo.maxPartialCovered}`}{" "}
          of {trimmedTo.totalAccounts} accounts had balance history then, so those totals are not
          net worth. Longer ranges unlock as history accumulates.
        </p>
      )}
      {coverage.hasPartial && (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span
            aria-hidden
            className="inline-block h-0 w-5 shrink-0 border-t-2 border-dashed border-current"
          />
          <span>
            Dashed: {coverage.minCovered === coverage.maxPartialCovered
              ? coverage.minCovered
              : `${coverage.minCovered}–${coverage.maxPartialCovered}`}{" "}
            of {coverage.totalAccounts} accounts had balance history
            {coverage.date ? ` before ${formatDateShort(coverage.date)}` : ""}, so it is not
            yet net worth.
          </span>
        </p>
      )}
    </section>
  );
}
