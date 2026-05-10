"use client";

import { useTransition } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createBudget, copyBudgetFromMonth } from "@/actions/budgets";
import { useRouter } from "next/navigation";
import { formatMonthLong } from "@/lib/date-utils";

interface BudgetEmptyStateProps {
  month: string;
  hasPreviousMonthBudget: boolean;
  previousMonth: string;
}

export function BudgetEmptyState({
  month,
  hasPreviousMonthBudget,
  previousMonth,
}: BudgetEmptyStateProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleCreate() {
    startTransition(async () => {
      await createBudget(month);
      router.refresh();
    });
  }

  function handleCopy() {
    startTransition(async () => {
      await copyBudgetFromMonth(previousMonth, month);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Wallet className="size-10 text-muted-foreground mb-3" />
      <h2 className="text-lg font-medium">No budget for {formatMonthLong(month)}</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-4">
        Set spending limits per category to track your budget.
      </p>
      <div className="flex gap-2">
        <Button onClick={handleCreate} disabled={isPending}>
          Create Budget
        </Button>
        {hasPreviousMonthBudget && (
          <Button variant="outline" onClick={handleCopy} disabled={isPending}>
            Copy from {formatMonthLong(previousMonth)}
          </Button>
        )}
      </div>
    </div>
  );
}
