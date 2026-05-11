"use client";

import Link from "next/link";
import { BudgetProgressBar } from "@/components/atoms/budget-progress-bar";
import { budgetProgressPercent } from "@/lib/budget-utils";
import type { BudgetMonth } from "@/queries/budgets";

interface BudgetProgressWidgetProps {
  data: BudgetMonth;
}

export function BudgetProgressWidget({ data }: BudgetProgressWidgetProps) {
  if (!data.budget) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-sm text-muted-foreground">
        <p>No budget set</p>
        <Link href="/budgets" className="text-primary underline text-xs mt-1">
          Create Budget
        </Link>
      </div>
    );
  }

  const allCategories = data.groups
    .flatMap((g) => g.categories)
    .sort((a, b) => budgetProgressPercent(b.spent, b.limitAmount) - budgetProgressPercent(a.spent, a.limitAmount));

  const top5 = allCategories.slice(0, 5);
  const remaining = allCategories.length - 5;

  return (
    <div className="flex flex-col gap-2 h-full">
      {top5.map((cat) => (
        <BudgetProgressBar
          key={cat.budgetCategoryId}
          label={cat.categoryName}
          spent={cat.spent}
          limit={cat.limitAmount}
        />
      ))}
      {remaining > 0 && (
        <Link href="/budgets" className="text-xs text-muted-foreground hover:text-primary">
          +{remaining} more
        </Link>
      )}
    </div>
  );
}
