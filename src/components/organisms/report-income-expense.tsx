"use client";

import { CashFlowBarChart } from "@/components/atoms/cash-flow-bar-chart";
import { centsToDisplay } from "@/lib/money";
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

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Income vs Expense</h3>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Total Income</div>
          <div className="text-lg font-semibold text-green-600">{centsToDisplay(totalIncome)}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Total Expenses</div>
          <div className="text-lg font-semibold text-destructive">{centsToDisplay(totalExpenses)}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Net</div>
          <div className={`text-lg font-semibold ${totalNet >= 0 ? "text-green-600" : "text-destructive"}`}>
            {centsToDisplay(totalNet)}
          </div>
        </div>
      </div>

      <div className="h-[300px]">
        <CashFlowBarChart data={chartData} />
      </div>
    </div>
  );
}
