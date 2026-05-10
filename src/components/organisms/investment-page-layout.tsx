"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp } from "lucide-react";
import { PortfolioSummaryHeader } from "@/components/organisms/portfolio-summary-header";
import { HoldingsTable } from "@/components/organisms/holdings-table";
import { InvestmentTransactionList } from "@/components/organisms/investment-transaction-list";
import { NetWorthAreaChart } from "@/components/atoms/net-worth-area-chart";
import { SpendingChart, type ChartDataItem } from "@/components/atoms/spending-chart";
import type {
  PortfolioSummary,
  PortfolioPoint,
  AllocationSlice,
  InvestmentHoldingRow,
  InvTxnRow,
  InvestmentFilters as IFilters,
} from "@/queries/investments";

interface InvestmentPageLayoutProps {
  summary: PortfolioSummary;
  history: PortfolioPoint[];
  allocation: AllocationSlice[];
  holdings: InvestmentHoldingRow[] | null;
  transactions: { rows: InvTxnRow[]; nextCursor: string | null } | null;
  activeTab: string;
  view: "consolidated" | "by-account";
  filters: IFilters;
  accounts: { id: string; name: string }[];
}

export function InvestmentPageLayout({ summary, history, allocation, holdings, transactions, activeTab, view, filters, accounts }: InvestmentPageLayoutProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (summary.totalValue === 0 && !holdings?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
        <TrendingUp className="size-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">No Investment Accounts</h2>
        <p className="text-muted-foreground max-w-md">Connect a brokerage or retirement account via Plaid to see your portfolio here.</p>
      </div>
    );
  }

  function handleTabChange(tab: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", tab);
    router.push(`?${params.toString()}`);
  }

  const allocationChartData: ChartDataItem[] = allocation.map((a) => ({
    name: a.type.charAt(0).toUpperCase() + a.type.slice(1).replace("_", " "),
    value: a.value,
  }));

  return (
    <div className="space-y-6">
      <PortfolioSummaryHeader summary={summary} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border rounded-lg p-4 h-[280px]">
          <h3 className="text-sm font-medium mb-2">Portfolio Value</h3>
          <div className="h-[240px]">
            <NetWorthAreaChart data={history} mode="single" seriesName="Portfolio" />
          </div>
        </div>
        <div className="border rounded-lg p-4 h-[280px]">
          <h3 className="text-sm font-medium mb-2">Asset Allocation</h3>
          <div className="h-[240px]">
            <SpendingChart data={allocationChartData} viewMode="donut" />
          </div>
        </div>
      </div>
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="holdings">Holdings</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>
        <TabsContent value="holdings" className="mt-4">
          {holdings && <HoldingsTable holdings={holdings} view={view} />}
        </TabsContent>
        <TabsContent value="transactions" className="mt-4">
          {transactions && (
            <InvestmentTransactionList initialRows={transactions.rows} initialCursor={transactions.nextCursor} filters={filters} accounts={accounts} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
