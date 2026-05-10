"use client";

import { useState } from "react";
import { TrendLineChart } from "@/components/atoms/trend-line-chart";
import { Checkbox } from "@/components/ui/checkbox";
import { CHART_COLORS } from "@/lib/chart-colors";
import type { CategoryTrendRow } from "@/queries/reports";

interface ReportTrendsProps {
  data: CategoryTrendRow[];
}

export function ReportTrends({ data }: ReportTrendsProps) {
  const allCategories = [...new Set(data.map((r) => r.categoryName))];
  const [selected, setSelected] = useState<Set<string>>(new Set(allCategories.slice(0, 10)));

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else if (next.size < 10) {
        next.add(name);
      }
      return next;
    });
  }

  const selectedList = allCategories.filter((c) => selected.has(c));
  const cats = selectedList.map((name, i) => ({
    name,
    color: CHART_COLORS[i % CHART_COLORS.length],
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

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Category Trends</h3>

      <div className="h-[300px]">
        <TrendLineChart data={chartData} categories={cats} />
      </div>

      <div className="flex flex-wrap gap-3">
        {allCategories.map((name) => (
          <label key={name} className="flex items-center gap-1.5 text-sm cursor-pointer">
            <Checkbox
              checked={selected.has(name)}
              onCheckedChange={() => toggle(name)}
            />
            {name}
          </label>
        ))}
      </div>
    </div>
  );
}
