"use client";

import { useState } from "react";
import { Wallet, Layers, Crown } from "lucide-react";
import { CategoryIcon } from "@/components/atoms/category-icon";
import { ChartViewToggle } from "@/components/atoms/chart-view-toggle";
import { SpendingChart } from "@/components/atoms/spending-chart";
import { ReportSummaryBar, type SummaryItem } from "@/components/atoms/report-summary-bar";
import { ComparisonBadge } from "@/components/molecules/comparison-badge";
import { DrillDownSheet, type DrillDownFilter } from "@/components/organisms/drill-down-sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { centsToDisplay } from "@/lib/money";
import { CHART_COLORS } from "@/lib/chart-colors";
import { useSearchParamFilters } from "@/hooks/use-search-param-filters";
import type { SpendingRow } from "@/queries/reports";

interface ReportSpendingProps {
  data: SpendingRow[];
  comparisonLabel: string | null;
}

export function ReportSpending({ data, comparisonLabel: compLabel }: ReportSpendingProps) {
  const [view, setView] = useState<"donut" | "bar">("donut");
  const [drillDown, setDrillDown] = useState<DrillDownFilter | null>(null);
  const { dateRange } = useSearchParamFilters();

  const chartData = data.map((r) => ({
    id: r.categoryId,
    name: r.categoryName,
    value: r.total,
  }));

  const totalSpent = data.reduce((s, r) => s + r.total, 0);
  const topCategory = data.length > 0 ? data[0] : null;
  const summaryItems: SummaryItem[] = [
    { label: "Total Spent", value: totalSpent, color: "expense", icon: Wallet },
    { label: "Categories", value: data.length, format: "number", icon: Layers },
    ...(topCategory
      ? [{ label: `Top: ${topCategory.categoryName}`, value: topCategory.total, icon: Crown } as SummaryItem]
      : []),
  ];

  function handleDrillDown(item: { id: string | null; name: string }) {
    setDrillDown({
      categoryId: item.id ?? undefined,
      categoryName: item.name,
      tabContext: "Spending",
    });
  }

  return (
    <div className="space-y-4">
      <ReportSummaryBar items={summaryItems} />

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Spending by Category</h3>
        <ChartViewToggle value={view} onChange={setView} />
      </div>

      <div className="h-[300px]">
        <SpendingChart data={chartData} viewMode={view} onItemClick={handleDrillDown} />
      </div>

      <div className="border rounded-lg">
        <Table className="text-sm">
          <TableHeader>
            <TableRow className="hover:bg-transparent text-muted-foreground">
              <TableHead className="h-auto px-3 py-2">Category</TableHead>
              <TableHead className="h-auto px-3 py-2 text-right">Amount</TableHead>
              {compLabel && <TableHead className="h-auto px-3 py-2 text-right">Change</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, i) => (
              <TableRow
                key={row.categoryId ?? "uncategorized"}
                className="cursor-pointer"
                onClick={() => handleDrillDown({ id: row.categoryId, name: row.categoryName })}
              >
                <TableCell className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                      style={
                        i < 8
                          ? {
                              color: CHART_COLORS[i],
                              backgroundColor: CHART_COLORS[i].replace(")", " / 0.12)"),
                            }
                          : undefined
                      }
                    >
                      <CategoryIcon name={row.categoryIcon ?? row.groupIcon} size={16} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm">{row.categoryName}</div>
                      {row.groupName && (
                        <div className="text-xs text-muted-foreground">{row.groupName}</div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-3 py-2 text-right tabular-nums font-medium">
                  {centsToDisplay(row.total)}
                </TableCell>
                {compLabel && (
                  <TableCell className="px-3 py-2 text-right">
                    <ComparisonBadge
                      current={row.total}
                      previous={row.prevTotal}
                      periodLabel={compLabel}
                    />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <DrillDownSheet
        filter={drillDown}
        dateFrom={dateRange.from}
        dateTo={dateRange.to}
        onClose={() => setDrillDown(null)}
      />
    </div>
  );
}
