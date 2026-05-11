"use client";

import { NetWorthAreaChart } from "@/components/atoms/net-worth-area-chart";
import { ReportSummaryBar, type SummaryItem } from "@/components/atoms/report-summary-bar";
import type { NetWorthPoint } from "@/queries/dashboard";

interface ReportNetWorthProps {
  data: NetWorthPoint[];
}

export function ReportNetWorth({ data }: ReportNetWorthProps) {
  const latest = data.length > 0 ? data[data.length - 1] : null;
  const earliest = data.length > 0 ? data[0] : null;
  const change = latest && earliest ? latest.netWorth - earliest.netWorth : 0;
  const changePct = earliest && earliest.netWorth !== 0
    ? ((change / Math.abs(earliest.netWorth)) * 100).toFixed(1)
    : "0.0";

  const summaryItems: SummaryItem[] = [
    { label: "Current Net Worth", value: latest?.netWorth ?? 0, color: "dynamic" },
    {
      label: "Change",
      value: change,
      color: "dynamic",
      secondaryLabel: `${change >= 0 ? "+" : ""}${changePct}%`,
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
