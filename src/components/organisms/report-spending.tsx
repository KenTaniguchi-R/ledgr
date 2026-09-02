"use client";

import { useState } from "react";
import { Wallet, Layers, Crown } from "lucide-react";
import { CategoryIconTile } from "@/components/atoms/category-icon";
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
import { activateOnKey } from "@/lib/a11y";
import { CHART_COLORS } from "@/lib/chart-colors";
import type { SpendingRow } from "@/queries/reports";

interface ReportSpendingProps {
  data: SpendingRow[];
  comparisonLabel: string | null;
  dateFrom: string;
  dateTo: string;
  accountIds?: string[];
}

export function ReportSpending({
  data,
  comparisonLabel: compLabel,
  dateFrom,
  dateTo,
  accountIds,
}: ReportSpendingProps) {
  const [view, setView] = useState<"donut" | "bar">("donut");
  const [drillDown, setDrillDown] = useState<DrillDownFilter | null>(null);

  const chartData = data.map((r) => ({
    id: r.categoryId,
    name: r.categoryName,
    value: r.total,
  }));

  const totalSpent = data.reduce((s, r) => s + r.total, 0);
  const topCategory = data.length > 0 ? data[0] : null;
  const summaryItems: SummaryItem[] = [
    { label: "Total Spent", value: totalSpent, color: "default", icon: Wallet },
    { label: "Categories", value: data.length, format: "number", icon: Layers },
    ...(topCategory
      ? [{ label: `Top: ${topCategory.categoryName}`, value: topCategory.total, icon: Crown } as SummaryItem]
      : []),
  ];

  function handleDrillDown(item: { id: string | null; name: string }) {
    // Keep the null: it means "uncategorized", not "every category".
    setDrillDown({
      categoryId: item.id,
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

      <div className="border rounded-lg overflow-x-auto">
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
                // The row is the click target for a mouse, and a focus stop for
                // a keyboard. Without the latter, drill-down was mouse-only:
                // every row measured tabIndex -1 with no role.
                tabIndex={0}
                role="button"
                aria-label={`Show ${row.categoryName} transactions, ${centsToDisplay(row.total)}`}
                className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                onClick={() => handleDrillDown({ id: row.categoryId, name: row.categoryName })}
                onKeyDown={activateOnKey(() =>
                  handleDrillDown({ id: row.categoryId, name: row.categoryName }),
                )}
              >
                <TableCell className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    <CategoryIconTile
                      name={row.categoryIcon}
                      style={
                        i < 8
                          ? {
                              color: CHART_COLORS[i],
                              backgroundColor: CHART_COLORS[i].replace(")", " / 0.12)"),
                            }
                          : undefined
                      }
                    />
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
        dateFrom={dateFrom}
        dateTo={dateTo}
        accountIds={accountIds}
        onClose={() => setDrillDown(null)}
      />
    </div>
  );
}
