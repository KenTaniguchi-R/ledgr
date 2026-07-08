"use client";

import dynamic from "next/dynamic";
import { PieChart, ArrowLeftRight, Waypoints, TrendingUp, LineChart } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSearchParamFilters } from "@/hooks/use-search-param-filters";
import type { SpendingRow, IncomeExpenseRow, CategoryTrendRow, IncomeExpenseCategoryRow, SafeToSpendResult } from "@/queries/reports";
import type { NetWorthPoint } from "@/queries/dashboard";
import type { SankeyNode, SankeyLink } from "@/components/organisms/sankey-chart";

// Each report panel pulls in recharts (or d3-sankey). Load only the active
// tab's panel so those chart libs stay out of the Reports initial bundle.
const tabLoading = () => (
  <div className="animate-pulse text-muted-foreground py-8 text-center text-sm">Loading…</div>
);
const ReportSpending = dynamic(
  () => import("./report-spending").then((m) => ({ default: m.ReportSpending })),
  { ssr: false, loading: tabLoading },
);
const ReportIncomeExpense = dynamic(
  () => import("./report-income-expense").then((m) => ({ default: m.ReportIncomeExpense })),
  { ssr: false, loading: tabLoading },
);
const ReportTrends = dynamic(
  () => import("./report-trends").then((m) => ({ default: m.ReportTrends })),
  { ssr: false, loading: tabLoading },
);
const ReportNetWorth = dynamic(
  () => import("./report-net-worth").then((m) => ({ default: m.ReportNetWorth })),
  { ssr: false, loading: tabLoading },
);
const ReportCashFlow = dynamic(
  () => import("./report-cash-flow").then((m) => ({ default: m.ReportCashFlow })),
  { ssr: false, loading: tabLoading },
);

interface ReportTabsProps {
  activeTab: string;
  spendingData?: SpendingRow[];
  incomeExpenseData?: IncomeExpenseRow[];
  incomeExpenseCategoryData?: IncomeExpenseCategoryRow[];
  trendsData?: CategoryTrendRow[];
  netWorthData?: NetWorthPoint[];
  sankeyNodes?: SankeyNode[];
  sankeyLinks?: SankeyLink[];
  cashFlowBarData?: IncomeExpenseRow[];
  safeToSpendData?: SafeToSpendResult;
  isCurrentMonth?: boolean;
  comparisonLabel: string | null;
}

export function ReportTabs({
  activeTab,
  spendingData,
  incomeExpenseData,
  incomeExpenseCategoryData,
  trendsData,
  netWorthData,
  sankeyNodes,
  sankeyLinks,
  cashFlowBarData,
  safeToSpendData,
  isCurrentMonth,
  comparisonLabel,
}: ReportTabsProps) {
  const { updateFilter } = useSearchParamFilters();

  return (
    <Tabs
      value={activeTab}
      onValueChange={(tab) => updateFilter("tab", tab === "spending" ? null : tab)}
    >
      <TabsList className="h-9">
        <TabsTrigger value="spending">
          <PieChart /> Spending
        </TabsTrigger>
        <TabsTrigger value="income-expense">
          <ArrowLeftRight /> Income vs Expense
        </TabsTrigger>
        <TabsTrigger value="cash-flow">
          <Waypoints /> Cash Flow
        </TabsTrigger>
        <TabsTrigger value="trends">
          <TrendingUp /> Trends
        </TabsTrigger>
        <TabsTrigger value="net-worth">
          <LineChart /> Net Worth
        </TabsTrigger>
      </TabsList>

      <TabsContent value="spending" className="mt-4">
        {spendingData && <ReportSpending data={spendingData} comparisonLabel={comparisonLabel} />}
      </TabsContent>
      <TabsContent value="income-expense" className="mt-4">
        {incomeExpenseData && (
          <ReportIncomeExpense data={incomeExpenseData} categoryData={incomeExpenseCategoryData} />
        )}
      </TabsContent>
      <TabsContent value="cash-flow" className="mt-4">
        {sankeyNodes && sankeyLinks && cashFlowBarData && safeToSpendData && (
          <ReportCashFlow
            sankeyNodes={sankeyNodes}
            sankeyLinks={sankeyLinks}
            barData={cashFlowBarData}
            safeToSpend={safeToSpendData}
            isCurrentMonth={isCurrentMonth ?? false}
          />
        )}
      </TabsContent>
      <TabsContent value="trends" className="mt-4">
        {trendsData && <ReportTrends data={trendsData} />}
      </TabsContent>
      <TabsContent value="net-worth" className="mt-4">
        {netWorthData && <ReportNetWorth data={netWorthData} />}
      </TabsContent>
    </Tabs>
  );
}
