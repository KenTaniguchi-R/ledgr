"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown, TriangleAlert } from "lucide-react";
import { CategoryIconTile } from "@/components/atoms/category-icon";
import { ChartViewToggle } from "@/components/atoms/chart-view-toggle";
import { SpendingChart } from "@/components/atoms/spending-chart";
import { ComparisonBadge } from "@/components/molecules/comparison-badge";
import { ReportStatStrip, type ReportStat } from "@/components/molecules/report-stat-strip";
import { Button } from "@/components/ui/button";
import type { CategoryGroup } from "@/queries/categories";
import { DrillDownSheet, type DrillDownFilter } from "@/components/organisms/drill-down-sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { centsToDisplay, centsToSignedDisplay, centsToWholeDisplay } from "@/lib/money";
import { activateOnKey } from "@/lib/a11y";
import { categoryColor, type CategoryColorMap } from "@/lib/category-colors";
import { formatDateShort } from "@/lib/date-utils";
import type { SpendingRow } from "@/queries/reports";

interface ReportSpendingProps {
  data: SpendingRow[];
  comparisonLabel: string | null;
  /** Total income over the same range, for the "Came in" / net figures. */
  totalIncome: number;
  /** Accounts whose history starts after the comparison window began — see countAccountsStartingAfter. */
  comparisonCoverage?: { late: number; total: number; since: string };
  /** One colour per category, shared with every other Reports tab. */
  categoryColors: CategoryColorMap;
  dateFrom: string;
  dateTo: string;
  accountIds?: string[];
  categories: CategoryGroup[];
}

/** "(3.6×)" once spending has multiplied, "(+14%)" for a smaller move. */
function formatDeltaMagnitude(current: number, previous: number): string {
  const ratio = current / previous;
  if (ratio >= 2) return `(${ratio.toFixed(1)}×)`;
  const percent = ((current - previous) / previous) * 100;
  return `(${percent >= 0 ? "+" : ""}${Math.round(percent)}%)`;
}

export function ReportSpending({
  data,
  comparisonLabel: compLabel,
  totalIncome,
  comparisonCoverage,
  categoryColors,
  dateFrom,
  dateTo,
  accountIds,
  categories,
}: ReportSpendingProps) {
  // Nine categories spanning three orders of magnitude is a size comparison,
  // which bars read directly and a donut does not.
  const [view, setView] = useState<"donut" | "bar">("bar");
  const [drillDown, setDrillDown] = useState<DrillDownFilter | null>(null);

  const chartData = data.map((r) => ({ id: r.categoryId, name: r.categoryName, value: r.total }));

  const totalSpent = data.reduce((s, r) => s + r.total, 0);
  const uncategorized = data.find((r) => r.categoryId === null)?.total ?? 0;
  const prevTotalSpent = data.reduce((s, r) => s + (r.prevTotal ?? 0), 0);
  const rangeLabel = `${formatDateShort(dateFrom)} – ${formatDateShort(dateTo)}`;
  const net = totalIncome - totalSpent;
  const maxShare = totalSpent > 0 ? Math.max(...data.map((r) => r.total / totalSpent)) * 100 : 0;

  function handleDrillDown(item: { id: string | null; name: string }) {
    // Keep the null: it means "uncategorized", not "every category".
    setDrillDown({
      categoryId: item.id,
      categoryName: item.name,
      tabContext: "Spending",
    });
  }

  // The old strip was three separate cards: a total, a "Compared with" card
  // that only repeated a date, and "Share of income 340.3%". None of them
  // answered "is this normal" on its own. One strip now carries the three
  // things a reader actually checks: how much, how that compares, and how
  // much still needs a human decision.
  const spendRose = totalSpent > prevTotalSpent;
  const stats: ReportStat[] = [
    {
      label: `Spent · ${rangeLabel}`,
      value: centsToDisplay(totalSpent),
      sub:
        compLabel && prevTotalSpent > 0 ? (
          <>
            <span className={`inline-flex items-center gap-1 ${spendRose ? "text-destructive" : "text-positive"}`}>
              {spendRose ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {centsToWholeDisplay(Math.abs(totalSpent - prevTotalSpent))}{" "}
              {formatDeltaMagnitude(totalSpent, prevTotalSpent)}
            </span>{" "}
            {compLabel}
          </>
        ) : undefined,
    },
    {
      label: "Came in",
      value: centsToDisplay(totalIncome),
      sub:
        totalIncome > 0 ? (
          <>
            Net <span className={net < 0 ? "text-destructive" : "text-positive"}>{centsToSignedDisplay(net)}</span>
            {totalSpent > totalIncome && ` · spent ${(totalSpent / totalIncome).toFixed(1)}× income`}
          </>
        ) : (
          "no income recorded in this range"
        ),
    },
    {
      label: "Needs a category",
      value: centsToDisplay(uncategorized),
      sub:
        uncategorized > 0
          ? `${totalSpent > 0 ? Math.round((uncategorized / totalSpent) * 100) : 0}% of spend`
          : "Everything is categorized",
      action:
        uncategorized > 0 ? (
          <Button variant="outline" size="sm" onClick={() => handleDrillDown({ id: null, name: "Uncategorized" })}>
            Review
          </Button>
        ) : undefined,
    },
  ];

  const showCoverageCaveat = Boolean(comparisonCoverage && comparisonCoverage.late > 0 && compLabel);

  return (
    <div className="space-y-4">
      <ReportStatStrip items={stats} />

      {showCoverageCaveat && comparisonCoverage && (
        <div className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
          <p>
            <span className="font-medium text-warning">Partial history.</span>{" "}
            {comparisonCoverage.late} of your {comparisonCoverage.total} accounts start after{" "}
            {formatDateShort(comparisonCoverage.since)},
            so the earlier period is undercounted and the increases below overstate the change.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">By category</h3>
        <ChartViewToggle value={view} onChange={setView} />
      </div>

      <div className="h-[300px]">
        <SpendingChart data={chartData} categoryColors={categoryColors} viewMode={view} onItemClick={handleDrillDown} />
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <Table className="text-sm">
          <TableHeader>
            <TableRow className="hover:bg-transparent text-muted-foreground">
              <TableHead className="h-auto px-3 py-2">Category</TableHead>
              <TableHead className="h-auto px-3 py-2 text-right">Amount</TableHead>
              <TableHead className="hidden h-auto px-3 py-2 text-right sm:table-cell">Share</TableHead>
              {compLabel && (
                <TableHead className="h-auto px-3 py-2 text-right whitespace-nowrap">
                  {/* The full period only fits from sm up; on a phone it pushed
                      the column off-screen. The period is in the strip above. */}
                  <span className="sm:hidden">Change</span>
                  <span className="hidden sm:inline">{compLabel}</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => {
              const color = categoryColor(categoryColors, row.categoryId);
              const isUncategorized = row.categoryId === null;
              const share = totalSpent > 0 ? (row.total / totalSpent) * 100 : 0;
              const shareBarWidth = maxShare > 0 ? (share / maxShare) * 100 : 0;

              return (
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
                          isUncategorized
                            ? {
                                color,
                                backgroundImage: `repeating-linear-gradient(135deg, color-mix(in oklab, ${color} 45%, transparent) 0 3px, transparent 3px 7px)`,
                              }
                            : { color, backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)` }
                        }
                      />
                      <div className="min-w-0">
                        <div className="text-sm">{row.categoryName}</div>
                        <div className="text-xs text-muted-foreground">
                          {isUncategorized ? "Needs review" : row.groupName}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-2 text-right tabular-nums font-medium">
                    {centsToDisplay(row.total)}
                  </TableCell>
                  <TableCell className="hidden px-3 py-2 text-right sm:table-cell">
                    <div className="inline-flex items-center justify-end gap-2">
                      <span className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-foreground/55"
                          style={{ width: `${shareBarWidth}%` }}
                        />
                      </span>
                      <span className="w-10 tabular-nums text-muted-foreground">{share.toFixed(1)}%</span>
                    </div>
                  </TableCell>
                  {compLabel && (
                    <TableCell className="px-3 py-2 text-right">
                      <ComparisonBadge current={row.total} previous={row.prevTotal} variant="stacked" />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <DrillDownSheet
        filter={drillDown}
        dateFrom={dateFrom}
        dateTo={dateTo}
        accountIds={accountIds}
        categories={categories}
        onClose={() => setDrillDown(null)}
      />
    </div>
  );
}
