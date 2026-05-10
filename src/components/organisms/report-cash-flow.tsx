"use client";

import { useState } from "react";
import { SankeyChart, type SankeyNode, type SankeyLink } from "@/components/molecules/sankey-chart";
import { CashFlowBarChart } from "@/components/atoms/cash-flow-bar-chart";
import { ReportSummaryBar, type SummaryItem } from "@/components/atoms/report-summary-bar";
import { DrillDownSheet, type DrillDownFilter } from "@/components/organisms/drill-down-sheet";
import { useSearchParamFilters } from "@/hooks/use-search-param-filters";
import type { IncomeExpenseRow } from "@/queries/reports";
import type { SafeToSpendResult } from "@/queries/reports";

interface ReportCashFlowProps {
  sankeyNodes: SankeyNode[];
  sankeyLinks: SankeyLink[];
  barData: IncomeExpenseRow[];
  safeToSpend: SafeToSpendResult;
  isCurrentMonth: boolean;
}

export function ReportCashFlow({
  sankeyNodes,
  sankeyLinks,
  barData,
  safeToSpend,
  isCurrentMonth,
}: ReportCashFlowProps) {
  const [drillDown, setDrillDown] = useState<DrillDownFilter | null>(null);
  const { searchParams } = useSearchParamFilters();

  const dateFrom = searchParams.get("from") ?? "2000-01-01";
  const dateTo = searchParams.get("to") ?? new Date().toISOString().slice(0, 10);

  const safeColor: SummaryItem["color"] = (() => {
    if (safeToSpend.monthlyIncome === 0) return "default";
    const pct = safeToSpend.safeToSpend / safeToSpend.monthlyIncome;
    if (pct < 0.05) return "expense";
    if (pct < 0.20) return "default";
    return "income";
  })();

  const summaryItems: SummaryItem[] = [
    { label: "Total Income", value: safeToSpend.monthlyIncome, color: "income" },
    { label: "Recurring Bills", value: safeToSpend.recurringExpenses, color: "expense" },
    { label: "Spent So Far", value: safeToSpend.discretionarySpent, color: "expense" },
    {
      label: "Safe to Spend",
      value: safeToSpend.safeToSpend,
      color: safeColor,
      secondaryLabel: isCurrentMonth ? undefined : "(current month)",
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
      categoryName: node?.name ?? "Unknown",
      type: type as "income" | "expense",
      tabContext: "Cash Flow",
    });
  }

  return (
    <div className="space-y-4">
      <ReportSummaryBar items={summaryItems} />

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
        onClose={() => setDrillDown(null)}
      />
    </div>
  );
}
