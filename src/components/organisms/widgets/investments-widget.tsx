"use client";

import { centsToDisplay } from "@/lib/money";
import { ComparisonBadge } from "@/components/molecules/comparison-badge";
import { TrendingUp } from "lucide-react";

interface InvestmentsWidgetProps {
  totalValue: number;
  dayChange: number | null;
}

export function InvestmentsWidget({ totalValue, dayChange }: InvestmentsWidgetProps) {
  return (
    <div className="flex flex-col gap-2 h-full justify-center">
      <div className="flex items-center gap-2 text-muted-foreground">
        <TrendingUp className="size-4" />
        <span className="text-sm font-medium">Investments</span>
      </div>
      <span className="text-2xl font-bold tabular-nums">{centsToDisplay(totalValue)}</span>
      {dayChange !== null && (
        <ComparisonBadge
          current={totalValue}
          previous={totalValue - dayChange}
          pill
        />
      )}
    </div>
  );
}
