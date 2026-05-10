"use client";

import { useState } from "react";
import { ChartViewToggle } from "@/components/atoms/chart-view-toggle";
import { SpendingChart } from "@/components/atoms/spending-chart";
import { ComparisonBadge } from "@/components/molecules/comparison-badge";
import { centsToDisplay } from "@/lib/money";
import type { SpendingRow } from "@/queries/reports";

interface ReportSpendingProps {
  data: SpendingRow[];
  comparisonLabel: string | null;
}

export function ReportSpending({ data, comparisonLabel: compLabel }: ReportSpendingProps) {
  const [view, setView] = useState<"donut" | "bar">("donut");

  const chartData = data.map((r) => ({
    id: r.categoryId,
    name: r.categoryName,
    value: r.total,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Spending by Category</h3>
        <ChartViewToggle value={view} onChange={setView} />
      </div>

      <div className="h-[300px]">
        <SpendingChart data={chartData} viewMode={view} />
      </div>

      <div className="border rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium text-right">Amount</th>
              {compLabel && <th className="px-3 py-2 font-medium text-right">Change</th>}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.categoryId ?? "uncategorized"} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <div className="text-sm">{row.categoryName}</div>
                  {row.groupName && (
                    <div className="text-xs text-muted-foreground">{row.groupName}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {centsToDisplay(row.total)}
                </td>
                {compLabel && (
                  <td className="px-3 py-2 text-right">
                    <ComparisonBadge
                      current={row.total}
                      previous={row.prevTotal}
                      periodLabel={compLabel}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
