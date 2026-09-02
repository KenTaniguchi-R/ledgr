"use client";

import { useState } from "react";
import { TrendingUp, Repeat, Receipt, PiggyBank } from "lucide-react";
import { SankeyChart, type SankeyNode, type SankeyLink } from "@/components/organisms/sankey-chart";
import { CashFlowBarChart } from "@/components/atoms/cash-flow-bar-chart";
import { ReportSummaryBar, type SummaryItem } from "@/components/atoms/report-summary-bar";
import { DrillDownSheet, type DrillDownFilter } from "@/components/organisms/drill-down-sheet";
import { resolvedCategoryLabel } from "@/lib/labels";
import { formatMonthLong } from "@/lib/date-utils";
import type { IncomeExpenseRow, SafeToSpendResult } from "@/queries/reports";

interface ReportCashFlowProps {
  sankeyNodes: SankeyNode[];
  sankeyLinks: SankeyLink[];
  barData: IncomeExpenseRow[];
  safeToSpend: SafeToSpendResult;
  dateFrom: string;
  dateTo: string;
  accountIds?: string[];
}

export function ReportCashFlow({
  sankeyNodes,
  sankeyLinks,
  barData,
  safeToSpend,
  dateFrom,
  dateTo,
  accountIds,
}: ReportCashFlowProps) {
  const [drillDown, setDrillDown] = useState<DrillDownFilter | null>(null);

  const safeColor: SummaryItem["color"] = (() => {
    if (safeToSpend.monthlyIncome === 0) return "default";
    const pct = safeToSpend.safeToSpend / safeToSpend.monthlyIncome;
    if (pct < 0.05) return "expense";
    if (pct < 0.20) return "default";
    return "income";
  })();

  const summaryItems: SummaryItem[] = [
    { label: "Total Income", value: safeToSpend.monthlyIncome, color: "income", icon: TrendingUp },
    { label: "Recurring Bills", value: safeToSpend.recurringExpenses, color: "expense", icon: Repeat },
    { label: "Spent So Far", value: safeToSpend.discretionarySpent, color: "expense", icon: Receipt },
    {
      label: "Safe to Spend",
      value: safeToSpend.safeToSpend,
      color: safeColor,
      secondaryLabel: "income, less bills still due and what you have spent",
      icon: PiggyBank,
    },
  ];

  const chartData = barData.map((r) => ({
    month: r.period,
    income: r.income,
    expenses: r.expenses,
    net: r.net,
  }));

  function handleNodeClick(nodeId: string, type: "income" | "expense" | "savings") {
    if (type === "savings") return;
    const catId = nodeId.replace(/^(income|expense)-/, "");
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
      {/* These four are a whole-calendar-month view and do not follow the date
          filter above — "how much is left to spend" is only a question about
          the month you are in. Say so, rather than letting a reader assume the
          chip applies and read $0.00 as a data problem. */}
      <section aria-labelledby="safe-to-spend-heading" className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h3 id="safe-to-spend-heading" className="text-lg font-medium">
            {formatMonthLong(safeToSpend.month)}
          </h3>
          <p className="text-xs text-muted-foreground">
            this month only — not affected by the date filter
          </p>
        </div>
        <ReportSummaryBar items={summaryItems} />
      </section>

      <h3 className="text-lg font-medium">Money Flow</h3>
      <div className="h-[400px]">
        <SankeyChart
          nodes={sankeyNodes}
          links={sankeyLinks}
          onNodeClick={handleNodeClick}
          height={400}
        />
      </div>

      <h3 className="text-lg font-medium">Monthly Breakdown</h3>
      <div className="h-[300px]">
        <CashFlowBarChart data={chartData} showTrendline />
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
