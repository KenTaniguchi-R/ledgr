"use client";

import { useState } from "react";
import { Wallet, CalendarDays } from "lucide-react";
import { TrendLineChart } from "@/components/atoms/trend-line-chart";
import { ReportSummaryBar, type SummaryItem } from "@/components/atoms/report-summary-bar";
import { Checkbox } from "@/components/ui/checkbox";
import { MAX_TREND_SERIES, trendSeriesColor } from "@/lib/series-colors";
import type { CategoryTrendRow } from "@/queries/reports";

interface ReportTrendsProps {
  data: CategoryTrendRow[];
}

export function ReportTrends({ data }: ReportTrendsProps) {
  const allCategories = [...new Set(data.map((r) => r.categoryName))];
  const [selected, setSelected] = useState<Set<string>>(
    new Set(allCategories.slice(0, MAX_TREND_SERIES)),
  );

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else if (next.size < MAX_TREND_SERIES) {
        next.add(name);
      }
      return next;
    });
  }

  const selectedList = allCategories.filter((c) => selected.has(c));
  // Colour keys off the category, not off its position in this filtered list —
  // otherwise unchecking one category repainted every line that remained.
  const cats = selectedList.map((name) => ({
    name,
    color: trendSeriesColor(allCategories, name),
  }));

  // Pivot data for Recharts: { period, CatA: 1000, CatB: 2000, ... }
  const periods = [...new Set(data.map((r) => r.period))].sort();
  const chartData = periods.map((period) => {
    const row: Record<string, number | string> = { period };
    for (const cat of selectedList) {
      const match = data.find((r) => r.period === period && r.categoryName === cat);
      row[cat] = match?.total ?? 0;
    }
    return row;
  });

  const totalSpent = data.reduce((s, r) => s + r.total, 0);
  const monthCount = new Set(data.map((r) => r.period)).size;
  const monthlyAvg = monthCount > 0 ? Math.round(totalSpent / monthCount) : 0;

  const summaryItems: SummaryItem[] = [
    { label: "Total Spent", value: totalSpent, color: "expense", icon: Wallet },
    { label: "Monthly Average", value: monthlyAvg, icon: CalendarDays },
  ];

  return (
    <div className="space-y-4">
      <ReportSummaryBar items={summaryItems} />
      <h3 className="text-lg font-medium">Category Trends</h3>

      <div className="h-[340px]">
        <TrendLineChart data={chartData} categories={cats} />
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Comparing {selected.size} of {MAX_TREND_SERIES}. Four lines is what the
          chart palette can keep apart at a glance — clear one to add another.
        </p>
        <div className="flex flex-wrap gap-3">
          {allCategories.map((name) => {
            const isSelected = selected.has(name);
            const atCapacity = !isSelected && selected.size >= MAX_TREND_SERIES;
            return (
              <label
                key={name}
                className={`flex items-center gap-1.5 text-sm ${
                  atCapacity ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                }`}
              >
                <Checkbox
                  checked={isSelected}
                  disabled={atCapacity}
                  onCheckedChange={() => toggle(name)}
                />
                {name}
              </label>
            );
          })}
        </div>
      </div>

    </div>
  );
}
