"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BudgetMonthNav } from "@/components/molecules/budget-month-nav";
import { updateBudgetType, copyBudgetFromMonth } from "@/actions/budgets";
import { cn } from "@/lib/utils";

interface BudgetPageHeaderProps {
  month: string;
  budgetId: string | null;
  budgetType: "category" | "flex";
  hasPreviousMonthBudget: boolean;
  previousMonth: string;
}

export function BudgetPageHeader({
  month,
  budgetId,
  budgetType,
  hasPreviousMonthBudget,
  previousMonth,
}: BudgetPageHeaderProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleTypeToggle(type: "category" | "flex") {
    if (!budgetId || type === budgetType) return;
    startTransition(async () => {
      await updateBudgetType(budgetId, type);
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
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Budgets</h1>
        <BudgetMonthNav month={month} />
      </div>
      <div className="flex items-center gap-2">
        {budgetId && (
          <div className="flex rounded-lg border p-0.5">
            <button
              onClick={() => handleTypeToggle("category")}
              disabled={isPending}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                budgetType === "category"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Category
            </button>
            <button
              onClick={() => handleTypeToggle("flex")}
              disabled={isPending}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                budgetType === "flex"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Flex
            </button>
          </div>
        )}
        {hasPreviousMonthBudget && budgetId && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={isPending}
          >
            <Copy className="size-3.5 mr-1.5" />
            Copy from prev
          </Button>
        )}
      </div>
    </div>
  );
}
