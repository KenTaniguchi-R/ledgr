"use client";

import { useState, useRef, useTransition, useCallback } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AmountDisplay } from "@/components/atoms/amount-display";
import { BudgetProgressBar } from "@/components/atoms/budget-progress-bar";
import { setBudgetCategory, removeBudgetCategory } from "@/actions/budgets";
import { centsToDisplay, parseToCents } from "@/lib/money";
import { cn } from "@/lib/utils";

interface BudgetCategoryRowProps {
  budgetId: string;
  budgetCategoryId: string | null;
  categoryId: string;
  categoryName: string;
  categoryIcon: string | null;
  limitAmount: number;
  spent: number;
  remaining: number;
  onSaved?: () => void;
}

function centsToInputDisplay(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function BudgetCategoryRow({
  budgetId,
  budgetCategoryId,
  categoryId,
  categoryName,
  categoryIcon,
  limitAmount,
  spent,
  remaining,
  onSaved,
}: BudgetCategoryRowProps) {
  const savedValue = useRef(limitAmount);
  const [inputValue, setInputValue] = useState(
    limitAmount > 0 ? centsToInputDisplay(limitAmount) : "",
  );
  const [optimisticLimit, setOptimisticLimit] = useState(limitAmount);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const optimisticRemaining = optimisticLimit - spent;

  const handleSave = useCallback(() => {
    setError(null);
    const trimmed = inputValue.trim();

    if (trimmed === "" && budgetCategoryId) {
      setOptimisticLimit(0);
      startTransition(async () => {
        const result = await removeBudgetCategory(budgetId, categoryId);
        if ("error" in result) {
          setOptimisticLimit(savedValue.current);
          setInputValue(centsToInputDisplay(savedValue.current));
          setError(result.error);
        } else {
          savedValue.current = 0;
          onSaved?.();
        }
      });
      return;
    }

    const cents = parseToCents(trimmed);
    if (cents === null && trimmed !== "") {
      setInputValue(centsToInputDisplay(savedValue.current));
      return;
    }

    const newLimit = cents ?? 0;
    if (newLimit === savedValue.current) return;

    setOptimisticLimit(newLimit);
    startTransition(async () => {
      const result = await setBudgetCategory(budgetId, categoryId, newLimit);
      if ("error" in result) {
        setOptimisticLimit(savedValue.current);
        setInputValue(centsToInputDisplay(savedValue.current));
        setError(result.error);
      } else {
        savedValue.current = newLimit;
        onSaved?.();
      }
    });
  }, [inputValue, budgetId, categoryId, budgetCategoryId, onSaved]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      inputRef.current?.blur();
    }
    if (e.key === "Escape") {
      setInputValue(
        savedValue.current > 0 ? centsToInputDisplay(savedValue.current) : "",
      );
      inputRef.current?.blur();
    }
  }

  return (
    <tr className="border-b last:border-b-0">
      <td className="py-2 px-3 text-sm">
        <span className="flex items-center gap-2">
          {categoryIcon && <span>{categoryIcon}</span>}
          {categoryName}
        </span>
      </td>
      <td className="py-2 px-3">
        <div className="relative w-28">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            $
          </span>
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            disabled={isPending}
            aria-label={`Budget for ${categoryName}`}
            className="h-7 pl-5 pr-2 text-xs text-right tabular-nums"
            placeholder="0.00"
          />
        </div>
      </td>
      <td className="py-2 px-3">
        <AmountDisplay amount={spent} className="text-xs" />
      </td>
      <td className="py-2 px-3">
        <span
          className={cn(
            "text-xs tabular-nums font-medium",
            optimisticRemaining < 0 && "text-destructive",
          )}
        >
          {centsToDisplay(optimisticRemaining)}
        </span>
      </td>
      <td className="py-2 px-3 w-32">
        <BudgetProgressBar spent={spent} limit={optimisticLimit} />
      </td>
      <td className="py-2 px-1 w-8">
        {budgetCategoryId && (
          <button
            onClick={() => {
              setInputValue("");
              handleSave();
            }}
            className="text-muted-foreground hover:text-foreground p-0.5"
            aria-label={`Remove budget for ${categoryName}`}
          >
            <X className="size-3" />
          </button>
        )}
      </td>
      {error && (
        <td>
          <span role="alert" aria-live="polite" className="text-xs text-destructive">
            {error}
          </span>
        </td>
      )}
    </tr>
  );
}
