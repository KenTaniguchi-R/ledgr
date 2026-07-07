"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CategoryIcon } from "@/components/atoms/category-icon";
import { BudgetCategoryRow } from "@/components/molecules/budget-category-row";
import { Table, TableBody } from "@/components/ui/table";
import { centsToDisplay } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { BudgetCategoryRow as BudgetCatRow } from "@/queries/budgets";

interface BudgetGroupSectionProps {
  budgetId: string;
  groupName: string;
  groupIcon: string | null;
  categories: BudgetCatRow[];
  totalBudgeted: number;
  totalSpent: number;
  defaultCollapsed?: boolean;
  isFixed?: boolean;
  onSaved?: () => void;
}

export function BudgetGroupSection({
  budgetId,
  groupName,
  groupIcon,
  categories,
  totalBudgeted,
  totalSpent,
  defaultCollapsed = false,
  isFixed = false,
  onSaved,
}: BudgetGroupSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className={cn("border rounded-lg", isFixed && "bg-muted/30")}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/50 rounded-t-lg"
      >
        <span className="flex items-center gap-2">
          {collapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
          {groupIcon && (
            <CategoryIcon name={groupIcon} size={16} className="text-muted-foreground" />
          )}
          {groupName}
          {isFixed && (
            <span className="text-xs text-muted-foreground font-normal">Fixed</span>
          )}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {centsToDisplay(totalSpent)} / {centsToDisplay(totalBudgeted)}
        </span>
      </button>
      {!collapsed && (
        <Table>
          <TableBody>
            {categories.map((cat) => (
              <BudgetCategoryRow
                key={cat.categoryId}
                budgetId={budgetId}
                budgetCategoryId={cat.budgetCategoryId}
                categoryId={cat.categoryId}
                categoryName={cat.categoryName}
                categoryIcon={cat.categoryIcon}
                limitAmount={cat.limitAmount}
                spent={cat.spent}
                onSaved={onSaved}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
