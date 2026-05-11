"use client";

import { DateRangeSelector } from "@/components/molecules/date-range-selector";
import { NetWorthAreaChart } from "@/components/atoms/net-worth-area-chart";
import type { NetWorthPoint } from "@/queries/dashboard";

interface NetWorthChartProps {
  data: NetWorthPoint[];
  onRangeChange: (range: string) => void;
  currentRange: string;
  isLoading?: boolean;
}

export function NetWorthChart({ data, onRangeChange, currentRange, isLoading }: NetWorthChartProps) {
  return (
    <div className="relative h-full flex flex-col">
      <div className="flex justify-end mb-2">
        <DateRangeSelector value={currentRange} onChange={onRangeChange} />
      </div>
      {isLoading && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
          <div className="animate-pulse text-sm text-muted-foreground">Loading...</div>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <NetWorthAreaChart data={data} />
      </div>
    </div>
  );
}
