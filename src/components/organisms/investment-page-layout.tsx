"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp } from "lucide-react";
import { PortfolioSummaryHeader } from "@/components/organisms/portfolio-summary-header";
import { HoldingsTable } from "@/components/organisms/holdings-table";
import { InvestmentTransactionList } from "@/components/organisms/investment-transaction-list";
import type { SpendingChartItem } from "@/components/atoms/spending-chart";

// Recharts-backed charts — load lazily so recharts stays out of the
// Investments initial bundle.
const chartLoading = () => (
  <div className="animate-pulse text-muted-foreground py-8 text-center text-sm">Loading…</div>
);
const NetWorthAreaChart = dynamic(
  () => import("@/components/atoms/net-worth-area-chart").then((m) => ({ default: m.NetWorthAreaChart })),
  { ssr: false, loading: chartLoading },
);
const SpendingChart = dynamic(
  () => import("@/components/atoms/spending-chart").then((m) => ({ default: m.SpendingChart })),
  { ssr: false, loading: chartLoading },
);
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

const ALLOCATION_TYPE_ACRONYMS = new Set(["etf", "reit"]);

function formatAllocationTypeLabel(type: string): string {
  if (ALLOCATION_TYPE_ACRONYMS.has(type)) return type.toUpperCase();
  return type.charAt(0).toUpperCase() + type.slice(1).replace("_", " ");
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

  const allocationChartData: SpendingChartItem[] = allocation.map((a) => ({
    id: null,
    name: formatAllocationTypeLabel(a.type),
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
