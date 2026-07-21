"use client";

import { useState, useTransition } from "react";
import { NetWorthAreaChart } from "@/components/atoms/net-worth-area-chart";
import { DateRangeSelector } from "@/components/molecules/date-range-selector";
import { centsToDisplay } from "@/lib/money";
import { trendDelta } from "@/lib/stat-delta";
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
}

export function NetWorthHero({ netWorth, initialHistory, initialRange = "6M" }: NetWorthHeroProps) {
  const [range, setRange] = useState(initialRange);
  const [history, setHistory] = useState(initialHistory);
  const [isLoading, startTransition] = useTransition();

  const delta = trendDelta(history.map((p) => p.netWorth));
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
                  delta.diff >= 0
                    ? "text-positive bg-positive/10"
                    : "text-destructive bg-destructive/10",
                )}
              >
                {delta.diff >= 0 ? "↑" : "↓"} {centsToDisplay(Math.abs(delta.diff))}
                {delta.pct !== null && ` (${Math.abs(delta.pct).toFixed(1)}%)`}{" "}
                <span className="font-medium opacity-75">
                  {RANGE_LABELS[range] ?? range.toLowerCase()}
                </span>
              </span>
            )}
          </div>
        </div>
        <DateRangeSelector value={range} onChange={handleRangeChange} />
      </div>
      <div className={cn("h-56 mt-3 transition-opacity", isLoading && "opacity-50")}>
        <NetWorthAreaChart
          mode="single"
          seriesName="Net worth"
          data={history.map((p) => ({ date: p.date, value: p.netWorth }))}
        />
      </div>
    </section>
  );
}
