"use client";

import { useOptimistic, useTransition } from "react";
import { PieChart, ArrowLeftRight, Waypoints, TrendingUp, LineChart } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSearchParamFilters } from "@/hooks/use-search-param-filters";
import { ReportPanelSkeleton } from "@/components/organisms/report-panel-skeleton";

interface ReportTabsProps {
  activeTab: string;
  /** The active tab's panel, streamed by the page inside a Suspense boundary. */
  children: React.ReactNode;
}

/**
 * The tab strip. It owns no data: the page renders only the active tab's
 * server panel and passes it in as `children`.
 */
export function ReportTabs({ activeTab, children }: ReportTabsProps) {
  const { updateFilter } = useSearchParamFilters();
  // A tab switch is a URL change, which round-trips to the server for the new
  // panel. Left alone, the old tab stayed highlighted over stale content for
  // the whole wait. The clicked tab lights up immediately, and until the new
  // panel arrives its skeleton stands in for the old one.
  const [, startTransition] = useTransition();
  const [optimisticTab, setOptimisticTab] = useOptimistic(
    activeTab,
    (_state: string, next: string) => next,
  );

  function handleTabChange(tab: string) {
    startTransition(() => {
      setOptimisticTab(tab);
      updateFilter("tab", tab === "spending" ? null : tab);
    });
  }

  const switching = optimisticTab !== activeTab;

  return (
    <Tabs value={optimisticTab} onValueChange={handleTabChange}>
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

      <TabsContent value={optimisticTab} className="mt-4" aria-busy={switching}>
        {switching ? <ReportPanelSkeleton /> : children}
      </TabsContent>
    </Tabs>
  );
}
