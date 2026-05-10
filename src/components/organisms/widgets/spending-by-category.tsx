"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChartViewToggle } from "@/components/atoms/chart-view-toggle";
import { SpendingChart } from "@/components/atoms/spending-chart";
import { formatMonthLong, shiftMonth } from "@/lib/date-utils";
import type { MonthlySpendingRow } from "@/queries/dashboard";

interface SpendingByCategoryProps {
  data: MonthlySpendingRow[];
  currentMonth: string;
  onMonthChange: (month: string) => void;
  isLoading?: boolean;
}

export function SpendingByCategory({ data, currentMonth, onMonthChange, isLoading }: SpendingByCategoryProps) {
  const [view, setView] = useState<"donut" | "bar">("donut");

  if (data.length === 0 && !isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No spending data for {formatMonthLong(currentMonth)}.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-6" onClick={() => onMonthChange(shiftMonth(currentMonth, -1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-medium min-w-[140px] text-center">{formatMonthLong(currentMonth)}</span>
          <Button variant="ghost" size="icon" className="size-6" onClick={() => onMonthChange(shiftMonth(currentMonth, 1))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <ChartViewToggle value={view} onChange={setView} />
      </div>
      <div className="flex-1 min-h-0">
        <SpendingChart data={data} viewMode={view} />
      </div>
    </div>
  );
}
