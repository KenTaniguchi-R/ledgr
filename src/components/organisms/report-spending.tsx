"use client";

import { useState } from "react";
import { CategoryIconTile } from "@/components/atoms/category-icon";
import { ChartViewToggle } from "@/components/atoms/chart-view-toggle";
import { SpendingChart } from "@/components/atoms/spending-chart";
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
import { formatDateShort } from "@/lib/date-utils";
import type { SpendingRow } from "@/queries/reports";

interface ReportSpendingProps {
  data: SpendingRow[];
  comparisonLabel: string | null;
  dateFrom: string;
  dateTo: string;
  accountIds?: string[];
  /** Total income over the same range, for the share-of-income figure. */
  totalIncome?: number;
}

export function ReportSpending({
  data,
  comparisonLabel: compLabel,
  dateFrom,
  dateTo,
  accountIds,
  totalIncome,
}: ReportSpendingProps) {
  // Nine categories spanning three orders of magnitude is a size comparison,
  // which bars read directly and a donut does not.
  const [view, setView] = useState<"donut" | "bar">("bar");
  const [drillDown, setDrillDown] = useState<DrillDownFilter | null>(null);

  const chartData = data.map((r) => ({
    id: r.categoryId,
    name: r.categoryName,
    value: r.total,
  }));

  const totalSpent = data.reduce((s, r) => s + r.total, 0);
  const uncategorized = data.find((r) => r.categoryId === null)?.total ?? 0;
  const categorized = totalSpent - uncategorized;
  const shareOfIncome = totalIncome && totalIncome > 0 ? (totalSpent / totalIncome) * 100 : null;
  const rangeLabel = `${formatDateShort(dateFrom)} – ${formatDateShort(dateTo)}`;

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
      {/* The old bar read Total Spent · Categories · Top: X. "Categories: 18" is
          a number no decision turns on, and the crown landed on Uncategorized
          whenever it was the largest line — a trophy for a data-quality gap.
          What a reader needs instead is how much of the total is unaccounted
          for, and what the total is measured against. */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border p-4 lg:col-span-1">
          <div className="text-xs text-muted-foreground">Total spent · {rangeLabel}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{centsToDisplay(totalSpent)}</div>
          {totalSpent > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: CHART_COLORS[0] }} />
                Categorized
                <span className="tabular-nums text-foreground">{centsToDisplay(categorized)}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: "var(--chart-neutral)" }} />
                Uncategorized
                <span className="tabular-nums text-foreground">{centsToDisplay(uncategorized)}</span>
              </span>
            </div>
          )}
        </div>

        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Compared with</div>
          <div className="mt-1 text-lg font-medium">
            {compLabel ? compLabel.replace(/^vs\s+/, "") : "Nothing — showing all time"}
          </div>
          {compLabel && (
            <div className="mt-1 text-xs text-muted-foreground">the preceding period, same length</div>
          )}
        </div>

        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Share of income</div>
          <div className="mt-1 text-lg font-medium tabular-nums">
            {shareOfIncome === null ? "—" : `${shareOfIncome.toFixed(1)}%`}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {totalIncome && totalIncome > 0
              ? `of ${centsToDisplay(totalIncome)} received`
              : "no income recorded in this range"}
          </div>
        </div>
      </div>

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
              <TableHead className="h-auto px-3 py-2 text-right">% of total</TableHead>
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
                      // Uncategorized takes the neutral here too, so the table
                      // and the chart agree about what is and is not a category.
                      style={
                        row.categoryId === null
                          ? {
                              color: "var(--chart-neutral)",
                              backgroundColor: "color-mix(in oklab, var(--chart-neutral) 12%, transparent)",
                            }
                          : i < 8
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
                <TableCell className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {totalSpent > 0 ? `${((row.total / totalSpent) * 100).toFixed(1)}%` : "—"}
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
