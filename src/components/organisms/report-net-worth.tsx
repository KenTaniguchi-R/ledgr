"use client";

import { NetWorthAreaChart } from "@/components/atoms/net-worth-area-chart";
import type { NetWorthPoint } from "@/queries/dashboard";

interface ReportNetWorthProps {
  data: NetWorthPoint[];
}

export function ReportNetWorth({ data }: ReportNetWorthProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Net Worth</h3>
      <div className="h-[400px]">
        <NetWorthAreaChart data={data} />
      </div>
    </div>
  );
}
