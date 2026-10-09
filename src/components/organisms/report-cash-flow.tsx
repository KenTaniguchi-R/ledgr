"use client";

import { useState } from "react";
import { SankeyChart, type SankeyNode, type SankeyLink } from "@/components/organisms/sankey-chart";
import { ReportStatStrip } from "@/components/molecules/report-stat-strip";
import { Card, CardContent } from "@/components/ui/card";
import type { CategoryGroup } from "@/queries/categories";
import { DrillDownSheet, type DrillDownFilter } from "@/components/organisms/drill-down-sheet";
import { resolvedCategoryLabel } from "@/lib/labels";
import { centsToDisplay, centsToSignedDisplay } from "@/lib/money";
import { formatDateShort, getCurrentMonth, monthBounds, todayDateString } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import type { CategoryColorMap } from "@/lib/category-colors";
import type { IncomeExpenseRow, SafeToSpendResult } from "@/queries/reports";

interface ReportCashFlowProps {
  sankeyNodes: SankeyNode[];
  sankeyLinks: SankeyLink[];
  barData: IncomeExpenseRow[];
  safeToSpend: SafeToSpendResult;
  categoryColors: CategoryColorMap;
  dateFrom: string;
  dateTo: string;
  accountIds?: string[];
  categories: CategoryGroup[];
}

export function ReportCashFlow({
  sankeyNodes,
  sankeyLinks,
  barData,
  safeToSpend,
  categoryColors,
  dateFrom,
  dateTo,
  accountIds,
  categories,
}: ReportCashFlowProps) {
  const [drillDown, setDrillDown] = useState<DrillDownFilter | null>(null);

  const rangeIncome = barData.reduce((s, r) => s + r.income, 0);
  const rangeExpenses = barData.reduce((s, r) => s + r.expenses, 0);
  const rangeNet = rangeIncome - rangeExpenses;
  const savingsRate = rangeIncome === 0 ? null : (rangeNet / rangeIncome) * 100;
  const rangeLabel = `${formatDateShort(dateFrom)} – ${formatDateShort(dateTo)}`;

  // "September so far": the calendar month's own start through today (or
  // through its last day, once the month is over) — deliberately not the date
  // filter above, since every figure in `safeToSpend` is a this-month quantity.
  const isCurrentMonth = safeToSpend.month === getCurrentMonth();
  const { from: monthStart, to: monthEnd } = monthBounds(safeToSpend.month);
  const monthSoFarEnd = isCurrentMonth ? todayDateString() : monthEnd;
  const [monthYear, monthNum] = safeToSpend.month.split("-");
  const monthName = new Date(Number(monthYear), Number(monthNum) - 1).toLocaleDateString("en-US", {
    month: "long",
  });

  // Bar scales to whichever is larger — income, or spent-plus-still-due — so
  // a month that has spent past its income still reads as a bar within bounds
  // rather than one segment silently clipping past 100%.
  const monthMax = Math.max(
    safeToSpend.monthlyIncome,
    safeToSpend.discretionarySpent + safeToSpend.recurringExpenses,
    1,
  );
  const spentPct = (safeToSpend.discretionarySpent / monthMax) * 100;
  const billsPct = (safeToSpend.recurringExpenses / monthMax) * 100;
  const incomeMarkerPct = Math.min((safeToSpend.monthlyIncome / monthMax) * 100, 100);

  function handleNodeClick(nodeId: string, type: SankeyNode["type"]) {
    // Savings and Shortfall are derived balances, not transactions to list.
    if (type === "savings" || type === "shortfall") return;
    const rawId = nodeId.replace(/^(income|expense)-/, "");
    // The query keys the uncategorized bucket as "uncategorized"; the
    // drill-down means that by a null category, not a literal id.
    const catId = rawId === "uncategorized" ? null : rawId;
    const node = sankeyNodes.find((n) => n.id === nodeId);
    setDrillDown({
      categoryId: catId,
      categoryName: resolvedCategoryLabel(node?.name),
      type,
      tabContext: "Cash Flow",
    });
  }

  return (
    <div className="space-y-4">
      <ReportStatStrip
        items={[
          { label: `Income · ${rangeLabel}`, value: centsToDisplay(rangeIncome), tone: "positive" },
          { label: "Spending", value: centsToDisplay(rangeExpenses) },
          {
            label: "Net",
            value: centsToSignedDisplay(rangeNet),
            tone: rangeNet > 0 ? "positive" : rangeNet < 0 ? "negative" : "default",
          },
          {
            label: "Savings rate",
            value:
              savingsRate === null ? "—" : `${savingsRate >= 0 ? "+" : ""}${Math.round(savingsRate)}%`,
            tone: savingsRate === null ? "default" : savingsRate >= 0 ? "positive" : "negative",
          },
        ]}
      />

      <h3 className="text-lg font-medium">Where the money went</h3>
      <Card>
        <CardContent>
          <SankeyChart
            nodes={sankeyNodes}
            links={sankeyLinks}
            categoryColors={categoryColors}
            onNodeClick={handleNodeClick}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
            <p className="text-xs text-muted-foreground">{monthName} so far · not affected by the date filter</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatDateShort(monthStart)} – {formatDateShort(monthSoFarEnd)}
            </p>
          </div>

          <p
            className={cn(
              "text-xl font-semibold tracking-tight tabular-nums",
              safeToSpend.safeToSpend > 0
                ? "text-positive"
                : safeToSpend.safeToSpend < 0
                  ? "text-destructive"
                  : "",
            )}
          >
            {centsToSignedDisplay(safeToSpend.safeToSpend)}{" "}
            <span className="text-xs font-normal text-muted-foreground">left to spend</span>
          </p>

          <div className="relative h-1.5 w-full" aria-hidden="true">
            <div className="flex h-full w-full overflow-hidden rounded-full bg-muted">
              <span className="h-full" style={{ width: `${spentPct}%`, backgroundColor: "var(--chart-neutral)" }} />
              <span className="h-full" style={{ width: `${billsPct}%`, backgroundColor: "var(--warning)" }} />
            </div>
            <span
              className="absolute top-[-3px] bottom-[-3px] w-[2px] bg-positive"
              style={{ left: `${incomeMarkerPct}%` }}
            />
          </div>

          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-positive" />
              Income {centsToDisplay(safeToSpend.monthlyIncome)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full" style={{ backgroundColor: "var(--chart-neutral)" }} />
              Spent {centsToDisplay(safeToSpend.discretionarySpent)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full" style={{ backgroundColor: "var(--warning)" }} />
              Bills still due {centsToDisplay(safeToSpend.recurringExpenses)}
            </span>
          </p>
        </CardContent>
      </Card>

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
