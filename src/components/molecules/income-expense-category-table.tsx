"use client";

import { centsToDisplay } from "@/lib/money";
import type { IncomeExpenseCategoryRow } from "@/queries/reports";
import { ChevronRight } from "lucide-react";
import { CategoryIcon } from "@/components/atoms/category-icon";
import { ScrollFade } from "@/components/atoms/scroll-fade";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface IncomeExpenseCategoryTableProps {
  data: IncomeExpenseCategoryRow[];
  onCategoryClick?: (categoryId: string, isIncome: boolean) => void;
}

export function IncomeExpenseCategoryTable({ data, onCategoryClick }: IncomeExpenseCategoryTableProps) {
  const incomeRows = data.filter((r) => r.isIncome);
  const expenseRows = data.filter((r) => !r.isIncome);

  return (
    <ScrollFade minWidth="500px">
        <div className="border rounded-lg">
          <Section label="Income Sources" rows={incomeRows} onCategoryClick={onCategoryClick} />
          <div className="border-t" />
          <Section label="Expense Categories" rows={expenseRows} onCategoryClick={onCategoryClick} />
        </div>
    </ScrollFade>
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

  const rowClass = onCategoryClick ? "cursor-pointer group" : "hover:bg-transparent";

  return (
    <div>
      <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/30">
        {label}
      </div>
      <Table className="text-sm">
        <TableHeader>
          <TableRow className="hover:bg-transparent text-muted-foreground">
            <TableHead className="h-auto px-3 py-1.5">Category</TableHead>
            <TableHead className="h-auto px-3 py-1.5 text-right">Total</TableHead>
            <TableHead className="h-auto px-3 py-1.5 text-right">Monthly Avg</TableHead>
            <TableHead className="h-auto px-3 py-1.5 text-right w-24">%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.categoryId}
              className={rowClass}
              onClick={() => onCategoryClick?.(row.categoryId, row.isIncome)}
            >
              <TableCell className="px-3 py-2 flex items-center gap-2">
                <span
                  aria-hidden
                  className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                >
                  <CategoryIcon name={row.categoryIcon} size={14} />
                </span>
                <span>{row.categoryName}</span>
                {onCategoryClick && (
                  <ChevronRight className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </TableCell>
              <TableCell className="px-3 py-2 text-right tabular-nums font-medium">
                {centsToDisplay(row.total)}
              </TableCell>
              <TableCell className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                {centsToDisplay(row.monthlyAverage)}
              </TableCell>
              <TableCell className="px-3 py-2 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <Progress
                    value={Math.min(row.percentOfTotal, 100)}
                    className="w-12"
                  />
                  <span className="tabular-nums text-xs text-muted-foreground w-8 text-right">
                    {row.percentOfTotal.toFixed(0)}%
                  </span>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
