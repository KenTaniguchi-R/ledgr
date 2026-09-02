"use client";

import { Wallet, TrendingUp } from "lucide-react";
import { NetWorthAreaChart } from "@/components/atoms/net-worth-area-chart";
import { ReportSummaryBar, type SummaryItem } from "@/components/atoms/report-summary-bar";
import { netWorthChange } from "@/lib/net-worth-change";
import type { NetWorthSeriesPoint } from "@/queries/dashboard";

interface ReportNetWorthProps {
  data: NetWorthSeriesPoint[];
}

export function ReportNetWorth({ data }: ReportNetWorthProps) {
  const { current, change, percent } = netWorthChange(data);

  const summaryItems: SummaryItem[] = [
    { label: "Current Net Worth", value: current, color: "dynamic", icon: Wallet },
    {
      label: "Change",
      value: change,
      color: "dynamic",
      // A percentage off a near-zero opening balance describes the balance, not
      // the period — $5.15 to $539.79 printed as "+10381.3%" as the headline.
      // Below the cutoff the absolute change stands on its own, with a line
      // saying why the ratio is missing rather than leaving a silent gap.
      secondaryLabel:
        percent !== null
          ? `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`
          : "from a near-zero opening balance",
      icon: TrendingUp,
    },
  ];

  return (
    <div className="space-y-4">
      <ReportSummaryBar items={summaryItems} />
      <h3 className="text-lg font-medium">Net Worth</h3>
      <div className="h-[400px]">
        <NetWorthAreaChart data={data} />
      </div>
    </div>
  );
}
