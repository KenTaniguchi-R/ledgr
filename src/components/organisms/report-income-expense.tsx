"use client";

import { useState } from "react";
import { CashFlowBarChart } from "@/components/atoms/cash-flow-bar-chart";
import { ReportSummaryBar, type SummaryItem } from "@/components/atoms/report-summary-bar";
import { IncomeExpenseCategoryTable } from "@/components/molecules/income-expense-category-table";
import { DrillDownSheet, type DrillDownFilter } from "@/components/organisms/drill-down-sheet";
import { useSearchParamFilters } from "@/hooks/use-search-param-filters";
import type { IncomeExpenseRow, IncomeExpenseCategoryRow } from "@/queries/reports";

interface ReportIncomeExpenseProps {
  data: IncomeExpenseRow[];
  categoryData?: IncomeExpenseCategoryRow[];
}

export function ReportIncomeExpense({ data, categoryData }: ReportIncomeExpenseProps) {
  const [drillDown, setDrillDown] = useState<DrillDownFilter | null>(null);
  const { dateRange } = useSearchParamFilters();

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

  function handleCategoryDrillDown(categoryId: string, isIncome: boolean) {
    const cat = categoryData?.find((c) => c.categoryId === categoryId);
    setDrillDown({
      categoryId,
      categoryName: cat?.categoryName ?? "Unknown",
      type: isIncome ? "income" : "expense",
      tabContext: "Income vs Expense",
    });
  }

  return (
    <div className="space-y-4">
      <ReportSummaryBar items={summaryItems} />
      <h3 className="text-lg font-medium">Income vs Expense</h3>
      <div className="h-[300px]">
        <CashFlowBarChart data={chartData} showTrendline />
      </div>
      {categoryData && (
        <IncomeExpenseCategoryTable
          data={categoryData}
          onCategoryClick={handleCategoryDrillDown}
        />
      )}
      <DrillDownSheet
        filter={drillDown}
        dateFrom={dateRange.from}
        dateTo={dateRange.to}
        onClose={() => setDrillDown(null)}
      />
    </div>
  );
}
