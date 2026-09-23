"use client";

import { useState } from "react";
import { CashFlowBarChart } from "@/components/atoms/cash-flow-bar-chart";
import { ReportStatStrip } from "@/components/molecules/report-stat-strip";
import { IncomeExpenseCategoryTable } from "@/components/molecules/income-expense-category-table";
import { DrillDownSheet, type DrillDownFilter } from "@/components/organisms/drill-down-sheet";
import { resolvedCategoryLabel } from "@/lib/labels";
import { centsToDisplay, centsToSignedDisplay } from "@/lib/money";
import { formatDateShort } from "@/lib/date-utils";
import type { IncomeExpenseRow, IncomeExpenseCategoryRow } from "@/queries/reports";

interface ReportIncomeExpenseProps {
  data: IncomeExpenseRow[];
  categoryData?: IncomeExpenseCategoryRow[];
  dateFrom: string;
  dateTo: string;
  accountIds?: string[];
}

export function ReportIncomeExpense({
  data,
  categoryData,
  dateFrom,
  dateTo,
  accountIds,
}: ReportIncomeExpenseProps) {
  const [drillDown, setDrillDown] = useState<DrillDownFilter | null>(null);

  const chartData = data.map((r) => ({
    month: r.period,
    income: r.income,
    expenses: r.expenses,
    net: r.net,
  }));

  const totalIncome = data.reduce((s, r) => s + r.income, 0);
  const totalExpenses = data.reduce((s, r) => s + r.expenses, 0);
  const totalNet = totalIncome - totalExpenses;

  const rangeLabel = `${formatDateShort(dateFrom)} – ${formatDateShort(dateTo)}`;

  function handleCategoryDrillDown(categoryId: string | null, isIncome: boolean) {
    const cat = categoryData?.find((c) => c.categoryId === categoryId);
    setDrillDown({
      categoryId,
      categoryName: resolvedCategoryLabel(cat?.categoryName),
      type: isIncome ? "income" : "expense",
      tabContext: "Income vs Expense",
    });
  }

  return (
    <div className="space-y-4">
      <ReportStatStrip
        items={[
          { label: `Income · ${rangeLabel}`, value: centsToDisplay(totalIncome), tone: "positive" },
          // Spending is normal; only the net carries a verdict colour.
          { label: "Spending", value: centsToDisplay(totalExpenses) },
          {
            label: "Net",
            value: centsToSignedDisplay(totalNet),
            tone: totalNet < 0 ? "negative" : "positive",
          },
        ]}
      />
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
        dateFrom={dateFrom}
        dateTo={dateTo}
        accountIds={accountIds}
        onClose={() => setDrillDown(null)}
      />
    </div>
  );
}
