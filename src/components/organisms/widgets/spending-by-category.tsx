"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChartViewToggle } from "@/components/atoms/chart-view-toggle";
import { SpendingChart } from "@/components/atoms/spending-chart";
import { WidgetPlaceholder } from "@/components/molecules/widget-placeholder";
import { formatMonthLong, shiftMonth } from "@/lib/date-utils";
import { uncategorizedShare } from "@/lib/uncategorized-share";
import { centsToDisplay } from "@/lib/money";
import type { MonthlySpendingRow } from "@/queries/dashboard";

interface SpendingByCategoryProps {
  data: MonthlySpendingRow[];
  currentMonth: string;
  onMonthChange: (month: string) => void;
  isLoading?: boolean;
}

export function SpendingByCategory({ data, currentMonth, onMonthChange, isLoading }: SpendingByCategoryProps) {
  const [view, setView] = useState<"donut" | "bar">("donut");

  // "Uncategorized" is the absence of data, not a category, and drawing it as a
  // peer slice makes the chart look complete when part of it is unknown. It
  // comes out of the series and is disclosed in the header instead — the pill
  // is not optional, or removing the slice would simply hide the shortfall.
  const share = uncategorizedShare(data);
  const categorized = data.filter((r) => r.categoryId !== null);

  if (data.length === 0 && !isLoading) {
    return (
      <WidgetPlaceholder
        title={`No spending in ${formatMonthLong(currentMonth)}`}
        description="Spending by category will appear here once transactions land in this month."
      />
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

      {share && (
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge variant="outline" className="border-warning/40 text-warning">
            {share.pct}% uncategorized
          </Badge>
          <span className="text-xs text-muted-foreground">
            {centsToDisplay(share.amount)} — shares below are of categorized spending only
          </span>
        </div>
      )}

      <div className="flex-1 min-h-0">
        {categorized.length === 0 ? (
          <WidgetPlaceholder
            title={`Nothing in ${formatMonthLong(currentMonth)} has a category yet`}
            description="Categorize a few transactions and the breakdown will fill in."
            actions={[{ label: "Start reviewing", href: "/transactions?mode=review", primary: true }]}
          />
        ) : (
          <SpendingChart
            data={categorized.map((r) => ({ id: r.categoryId, name: r.categoryName, value: r.total }))}
            viewMode={view}
          />
        )}
      </div>
    </div>
  );
}
