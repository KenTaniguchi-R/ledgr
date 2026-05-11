"use client";

import { centsToDisplay } from "@/lib/money";
import type { IncomeExpenseCategoryRow } from "@/queries/reports";
import { ChevronRight } from "lucide-react";

interface IncomeExpenseCategoryTableProps {
  data: IncomeExpenseCategoryRow[];
  onCategoryClick?: (categoryId: string, isIncome: boolean) => void;
}

export function IncomeExpenseCategoryTable({ data, onCategoryClick }: IncomeExpenseCategoryTableProps) {
  const incomeRows = data.filter((r) => r.isIncome);
  const expenseRows = data.filter((r) => !r.isIncome);

  return (
    <div className="overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]">
      <div className="min-w-[500px]">
        <div className="border rounded-lg">
          <Section label="Income Sources" rows={incomeRows} onCategoryClick={onCategoryClick} />
          <div className="border-t" />
          <Section label="Expense Categories" rows={expenseRows} onCategoryClick={onCategoryClick} />
        </div>
      </div>
    </div>
  );
}

function Section({
  label,
  rows,
  onCategoryClick,
}: {
  label: string;
  rows: IncomeExpenseCategoryRow[];
  onCategoryClick?: (categoryId: string, isIncome: boolean) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="px-3 py-4 text-sm text-muted-foreground text-center">
        No {label.toLowerCase()} found.
      </div>
    );
  }

  return (
    <div>
      <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/30">
        {label}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="px-3 py-1.5 font-medium">Category</th>
            <th className="px-3 py-1.5 font-medium text-right">Total</th>
            <th className="px-3 py-1.5 font-medium text-right">Monthly Avg</th>
            <th className="px-3 py-1.5 font-medium text-right w-24">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.categoryId}
              className={`border-b last:border-0 ${onCategoryClick ? "cursor-pointer hover:bg-muted/50 group" : ""}`}
              onClick={() => onCategoryClick?.(row.categoryId, row.isIncome)}
            >
              <td className="px-3 py-2 flex items-center gap-1">
                <span>{row.categoryName}</span>
                {onCategoryClick && (
                  <ChevronRight className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-medium">
                {centsToDisplay(row.total)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                {centsToDisplay(row.monthlyAverage)}
              </td>
              <td className="px-3 py-2 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(row.percentOfTotal, 100)}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-xs text-muted-foreground w-8 text-right">
                    {row.percentOfTotal.toFixed(0)}%
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
