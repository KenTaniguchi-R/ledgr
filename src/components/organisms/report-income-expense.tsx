"use client";

import { CashFlowBarChart } from "@/components/atoms/cash-flow-bar-chart";
import { ReportSummaryBar, type SummaryItem } from "@/components/atoms/report-summary-bar";
import type { IncomeExpenseRow } from "@/queries/reports";

interface ReportIncomeExpenseProps {
  data: IncomeExpenseRow[];
}

export function ReportIncomeExpense({ data }: ReportIncomeExpenseProps) {
  const chartData = data.map((r) => ({
    month: r.period,
    income: r.income,
    expenses: r.expenses,
    net: r.net,
  }));

  const totalIncome = data.reduce((s, r) => s + r.income, 0);
  const totalExpenses = data.reduce((s, r) => s + r.expenses, 0);
  const totalNet = totalIncome - totalExpenses;

  const summaryItems: SummaryItem[] = [
    { label: "Total Income", value: totalIncome, color: "income" },
    { label: "Total Expenses", value: totalExpenses, color: "expense" },
    { label: "Net", value: totalNet, color: "dynamic" },
  ];

  return (
    <div className="space-y-4">
      <ReportSummaryBar items={summaryItems} />
      <h3 className="text-lg font-medium">Income vs Expense</h3>
      <div className="h-[300px]">
        <CashFlowBarChart data={chartData} />
      </div>
    </div>
  );
}
