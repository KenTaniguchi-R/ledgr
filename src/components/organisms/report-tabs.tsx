"use client";

import dynamic from "next/dynamic";
import { PieChart, ArrowLeftRight, Waypoints, TrendingUp, LineChart } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSearchParamFilters } from "@/hooks/use-search-param-filters";
import type { SpendingRow, IncomeExpenseRow, CategoryTrendRow, IncomeExpenseCategoryRow, SafeToSpendResult } from "@/queries/reports";
import type { NetWorthSeriesPoint } from "@/queries/dashboard";
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
  netWorthData?: NetWorthSeriesPoint[];
  sankeyNodes?: SankeyNode[];
  sankeyLinks?: SankeyLink[];
  cashFlowBarData?: IncomeExpenseRow[];
  safeToSpendData?: SafeToSpendResult;
  comparisonLabel: string | null;
  /** Income over the selected range — the Spending tab's share-of-income figure. */
  spendingTotalIncome?: number;
  /**
   * The range the figures on screen were actually computed over. Passed down
   * rather than re-read from the URL, so a drill-down can never query a
   * different period than the row that opened it — on a bare `/reports` the
   * URL carries no dates at all, and the client-side fallback was all-time.
   */
  dateFrom: string;
  dateTo: string;
  accountIds?: string[];
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
  comparisonLabel,
  spendingTotalIncome,
  dateFrom,
  dateTo,
  accountIds,
}: ReportTabsProps) {
  const { updateFilter } = useSearchParamFilters();

  return (
    <Tabs
      value={activeTab}
      onValueChange={(tab) => updateFilter("tab", tab === "spending" ? null : tab)}
    >
      {/* Five tabs do not fit a phone. Without a scroll container the list
          just widened the page — Trends and Net Worth sat off-screen with no
          way to reach them, because the list itself computes
          `overflow-x: visible`. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
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
      </div>

      <TabsContent value="spending" className="mt-4">
        {spendingData && (
          <ReportSpending
            data={spendingData}
            comparisonLabel={comparisonLabel}
            totalIncome={spendingTotalIncome}
            dateFrom={dateFrom}
            dateTo={dateTo}
            accountIds={accountIds}
          />
        )}
      </TabsContent>
      <TabsContent value="income-expense" className="mt-4">
        {incomeExpenseData && (
          <ReportIncomeExpense
            data={incomeExpenseData}
            categoryData={incomeExpenseCategoryData}
            dateFrom={dateFrom}
            dateTo={dateTo}
            accountIds={accountIds}
          />
        )}
      </TabsContent>
      <TabsContent value="cash-flow" className="mt-4">
        {sankeyNodes && sankeyLinks && cashFlowBarData && safeToSpendData && (
          <ReportCashFlow
            sankeyNodes={sankeyNodes}
            sankeyLinks={sankeyLinks}
            barData={cashFlowBarData}
            safeToSpend={safeToSpendData}
            dateFrom={dateFrom}
            dateTo={dateTo}
            accountIds={accountIds}
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
