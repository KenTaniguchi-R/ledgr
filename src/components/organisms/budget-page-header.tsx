"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { BudgetMonthNav } from "@/components/molecules/budget-month-nav";
import { updateBudgetType, copyBudgetFromMonth } from "@/actions/budgets";

const BUDGET_TYPES = [
  { value: "category", label: "Category" },
  { value: "flex", label: "Flex" },
] as const;

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

  // Base UI models a toggle group as an array even when only one item can be
  // active, and hands back an empty array when the active item is clicked
  // again. Ignoring anything that isn't a budget type keeps one option selected.
  function handleTypeToggle(groupValue: string[]) {
    const type = groupValue[0];
    if (!budgetId || (type !== "category" && type !== "flex") || type === budgetType) return;
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
          <ToggleGroup
            value={[budgetType]}
            onValueChange={handleTypeToggle}
            variant="outline"
            size="sm"
            spacing={1}
            aria-label="Budget type"
          >
            {BUDGET_TYPES.map(({ value, label }) => (
              <ToggleGroupItem
                key={value}
                value={value}
                disabled={isPending}
                // The shared toggle marks the active item with `bg-muted`, which
                // is too close to the page ground to read as selected on a
                // control whose whole job is showing which option is active.
                // Same override the appearance toggle uses.
                className="aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary"
              >
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
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
