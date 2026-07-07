"use client";

import { PieChart, ArrowLeftRight, Waypoints, TrendingUp, LineChart } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSearchParamFilters } from "@/hooks/use-search-param-filters";
import { ReportSpending } from "./report-spending";
import { ReportIncomeExpense } from "./report-income-expense";
import { ReportTrends } from "./report-trends";
import { ReportNetWorth } from "./report-net-worth";
import { ReportCashFlow } from "./report-cash-flow";
import type { SpendingRow, IncomeExpenseRow, CategoryTrendRow, IncomeExpenseCategoryRow, SafeToSpendResult } from "@/queries/reports";
import type { NetWorthPoint } from "@/queries/dashboard";
import type { SankeyNode, SankeyLink } from "@/components/organisms/sankey-chart";

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
