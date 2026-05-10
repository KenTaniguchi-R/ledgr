"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSearchParamFilters } from "@/hooks/use-search-param-filters";
import { ReportSpending } from "./report-spending";
import { ReportIncomeExpense } from "./report-income-expense";
import { ReportTrends } from "./report-trends";
import { ReportNetWorth } from "./report-net-worth";
import type { SpendingRow, IncomeExpenseRow, CategoryTrendRow, IncomeExpenseCategoryRow } from "@/queries/reports";
import type { NetWorthPoint } from "@/queries/dashboard";

interface ReportTabsProps {
  activeTab: string;
  spendingData?: SpendingRow[];
  incomeExpenseData?: IncomeExpenseRow[];
  incomeExpenseCategoryData?: IncomeExpenseCategoryRow[];
  trendsData?: CategoryTrendRow[];
  netWorthData?: NetWorthPoint[];
  comparisonLabel: string | null;
}

export function ReportTabs({
  activeTab,
  spendingData,
  incomeExpenseData,
  incomeExpenseCategoryData,
  trendsData,
  netWorthData,
  comparisonLabel,
}: ReportTabsProps) {
  const { updateFilter } = useSearchParamFilters();

  return (
    <Tabs
      value={activeTab}
      onValueChange={(tab) => updateFilter("tab", tab === "spending" ? null : tab)}
    >
      <TabsList>
        <TabsTrigger value="spending">Spending</TabsTrigger>
        <TabsTrigger value="income-expense">Income vs Expense</TabsTrigger>
        <TabsTrigger value="trends">Trends</TabsTrigger>
        <TabsTrigger value="net-worth">Net Worth</TabsTrigger>
      </TabsList>

      <TabsContent value="spending" className="mt-4">
        {spendingData && <ReportSpending data={spendingData} comparisonLabel={comparisonLabel} />}
      </TabsContent>
      <TabsContent value="income-expense" className="mt-4">
        {incomeExpenseData && <ReportIncomeExpense data={incomeExpenseData} categoryData={incomeExpenseCategoryData} />}
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
