"use client";

import { useState } from "react";
import { TrendLineChart, type TrendCategory } from "@/components/atoms/trend-line-chart";
import { ReportStatStrip, type ReportStat } from "@/components/molecules/report-stat-strip";
import {
  categoryColor,
  NEUTRAL_CATEGORY_COLOR,
  UNCATEGORIZED_KEY,
  type CategoryColorMap,
} from "@/lib/category-colors";
import { MAX_TREND_SERIES } from "@/lib/series-colors";
import { monthsSpanned, monthBounds, formatDateShort } from "@/lib/date-utils";
import { centsToDisplay } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { CategoryTrendRow } from "@/queries/reports";

interface ReportTrendsProps {
  data: CategoryTrendRow[];
  categoryColors: CategoryColorMap;
  dateFrom: string;
  dateTo: string;
}

interface CategoryTotal {
  /** categoryId, or the shared uncategorized key. */
  key: string;
  categoryId: string | null;
  name: string;
  total: number;
}

/**
 * Dashes for the second and later selected category that lands on the
 * neutral colour — Uncategorized plus anything outside the top 8 palette
 * slots all draw grey, and colour alone stops telling them apart once two of
 * them are picked at once. The first neutral in the group stays solid: it's
 * already distinguishable from every non-neutral line by colour.
 */
const NEUTRAL_DASH_PATTERNS = ["2 2", "1 4", "6 2 1 2"];

export function ReportTrends({ data, categoryColors, dateFrom, dateTo }: ReportTrendsProps) {
  const totalsByKey = new Map<string, CategoryTotal>();
  for (const r of data) {
    const key = r.categoryId ?? UNCATEGORIZED_KEY;
    const existing = totalsByKey.get(key);
    if (existing) {
      existing.total += r.total;
    } else {
      totalsByKey.set(key, { key, categoryId: r.categoryId, name: r.categoryName, total: r.total });
    }
  }
  // Sorted by total spend over the range, descending, so the chips and
  // defaults reflect what actually dominates the range rather than whatever
  // order the query happened to group first. The chips below reuse this order
  // for the same reason.
  const allCategories = [...totalsByKey.values()].sort((a, b) => b.total - a.total);

  // Defaults exclude Uncategorized — it's still pickable, just never assumed.
  const defaultTop = allCategories.filter((c) => c.categoryId !== null).slice(0, MAX_TREND_SERIES);
  // Ordered smallest-first (a queue, not a Set) so that picking a 5th
  // category evicts the smallest default rather than the top spender, which
  // used to be the first thing to disappear.
  const [selected, setSelected] = useState<string[]>(() => [...defaultTop].reverse().map((c) => c.key));

  function toggle(key: string) {
    setSelected((prev) => {
      if (prev.includes(key)) {
        // Never drop the last category: an empty chart has no way back in.
        return prev.length > 1 ? prev.filter((k) => k !== key) : prev;
      }
      const withRoom = prev.length >= MAX_TREND_SERIES ? prev.slice(1) : prev;
      return [...withRoom, key];
    });
  }

  // Rendered in the fixed sorted order rather than selection (insertion)
  // order, so the chips and lines don't reshuffle every time one is toggled.
  const selectedList = allCategories.filter((c) => selected.includes(c.key));

  // Colour comes from the shared per-page map so a category matches its
  // colour on Spending and Cash Flow too. Two selected categories can both
  // land on the neutral (Uncategorized, or anything outside the top 8) — flag
  // every neutral past the first so the chart can tell them apart with a dash.
  const neutralOrder: string[] = [];
  for (const c of selectedList) {
    if (categoryColor(categoryColors, c.categoryId) === NEUTRAL_CATEGORY_COLOR) {
      neutralOrder.push(c.key);
    }
  }
  const cats: TrendCategory[] = selectedList.map((c) => {
    const baseColor = categoryColor(categoryColors, c.categoryId);
    const isNeutral = baseColor === NEUTRAL_CATEGORY_COLOR;
    const neutralIndex = isNeutral ? neutralOrder.indexOf(c.key) : -1;
    return {
      key: c.key,
      name: c.name,
      color: isNeutral ? "var(--muted-foreground)" : baseColor,
      dashPattern:
        neutralIndex > 0 ? NEUTRAL_DASH_PATTERNS[(neutralIndex - 1) % NEUTRAL_DASH_PATTERNS.length] : undefined,
    };
  });

  // Pivot data for Recharts: { period, [categoryKey]: cents, ... }
  const periods = [...new Set(data.map((r) => r.period))].sort();
  const chartData = periods.map((period) => {
    const row: Record<string, number | string> = { period };
    for (const cat of selectedList) {
      const match = data.find((r) => r.period === period && (r.categoryId ?? UNCATEGORIZED_KEY) === cat.key);
      row[cat.key] = match?.total ?? 0;
    }
    return row;
  });

  // The first and last months of a range are usually partial — a Jun 23–Sep
  // 23 range touches June and September without covering either end to end.
  const partialPeriods = new Set(
    periods.filter((period) => {
      const bounds = monthBounds(period);
      return bounds.from < dateFrom || bounds.to > dateTo;
    }),
  );

  const totalSpent = data.reduce((s, r) => s + r.total, 0);
  // The divisor is the range actually covered, not the count of distinct
  // calendar months the data touches — a Jun 23 - Sep 23 range touches 4
  // months but spans about 3. The "all time" preset passes dateFrom
  // 2000-01-01, so the range is clamped to where the data actually starts.
  const firstPeriod = periods[0];
  const firstMonthStart = firstPeriod ? `${firstPeriod}-01` : dateFrom;
  const effectiveFrom = firstMonthStart > dateFrom ? firstMonthStart : dateFrom;
  const span = monthsSpanned(effectiveFrom, dateTo);
  const monthlyAvg = Math.round(totalSpent / span);

  const rangeLabel = `${formatDateShort(dateFrom)} – ${formatDateShort(dateTo)}`;
  const statItems: ReportStat[] = [
    { label: `Spent · ${rangeLabel}`, value: centsToDisplay(totalSpent) },
    {
      label: "Monthly average",
      value: centsToDisplay(monthlyAvg),
      sub: `over ${span.toFixed(1)} months`,
    },
  ];

  return (
    <div className="space-y-4">
      <ReportStatStrip items={statItems} />
      <h3 className="text-lg font-medium">Category Trends</h3>

      <div className="h-[340px]">
        <TrendLineChart data={chartData} categories={cats} partialPeriods={partialPeriods} />
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Showing {selected.length} of up to {MAX_TREND_SERIES}
        </p>
        <div className="flex flex-wrap gap-2">
          {allCategories.map((c) => {
            const active = selected.includes(c.key);
            const baseColor = categoryColor(categoryColors, c.categoryId);
            const dotColor = baseColor === NEUTRAL_CATEGORY_COLOR ? "var(--muted-foreground)" : baseColor;
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(c.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                  active
                    ? "border-transparent bg-muted font-medium text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
                {c.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
