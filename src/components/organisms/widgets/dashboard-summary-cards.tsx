"use client";

import { SummaryCard } from "@/components/molecules/summary-card";
import type { DashboardSummary } from "@/queries/dashboard";

interface DashboardSummaryCardsProps {
  data: DashboardSummary;
}

export function DashboardSummaryCards({ data }: DashboardSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 h-full overflow-y-auto">
      <SummaryCard
        label="Net Worth"
        amount={data.netWorth}
        variant={data.netWorth >= 0 ? "positive" : "negative"}
      />
      <SummaryCard
        label="Monthly Income"
        amount={data.monthlyIncome}
        variant="positive"
      />
      <SummaryCard
        label="Monthly Expenses"
        amount={data.monthlyExpenses}
        variant="negative"
      />
      <SummaryCard
        label="Net Savings"
        amount={data.monthlyNet}
        variant={data.monthlyNet >= 0 ? "positive" : "negative"}
      />
    </div>
  );
}
