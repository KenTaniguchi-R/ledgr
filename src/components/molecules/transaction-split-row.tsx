"use client";

import { useState, useTransition, useRef, useCallback } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/atoms/currency-input";
import { CategoryPill } from "@/components/molecules/category-pill";
import type { CategoryGroup } from "@/queries/categories";
import type { SplitRow } from "@/queries/transactions";
import { upsertSplit } from "@/actions/transaction-detail";

interface TransactionSplitRowProps {
  transactionId: string;
  split: SplitRow & { isDraft?: boolean };
  categories: CategoryGroup[];
  onUpdate: (split: SplitRow) => void;
  onDelete: (splitId: string) => void;
}

export function TransactionSplitRow({
  transactionId,
  split,
  categories,
  onUpdate,
  onDelete,
}: TransactionSplitRowProps) {
  const [amount, setAmount] = useState(split.amount);
  const savedAmount = useRef(split.amount);
  const [isPending, startTransition] = useTransition();

  const handleCategoryChange = useCallback(
    (categoryId: string | null, categoryName: string | null) => {
      if (!categoryId) return;
      startTransition(async () => {
        const result = await upsertSplit(
          transactionId,
          split.isDraft ? null : split.id,
          { categoryId, amount, notes: split.notes },
        );
        if ("error" in result) return;
        savedAmount.current = amount;
        onUpdate({
          ...split,
          id: result.data.id,
          categoryId,
          categoryName,
          amount: result.data.amount,
        });
      });
    },
    [split, transactionId, amount, onUpdate],
  );

  const handleAmountBlur = useCallback(() => {
    if (amount === savedAmount.current) return;
    if (!split.categoryId) return;

    startTransition(async () => {
      const result = await upsertSplit(
        transactionId,
        split.isDraft ? null : split.id,
        { categoryId: split.categoryId, amount, notes: split.notes },
      );
      if ("error" in result) {
        setAmount(savedAmount.current);
      } else {
        savedAmount.current = amount;
        onUpdate({ ...split, id: result.data.id, amount: result.data.amount });
      }
    });
  }, [amount, split, transactionId, onUpdate]);

  return (
    <div className="grid grid-cols-[1fr_100px_32px] items-center gap-1.5 py-1">
      <div className="min-w-0">
        <CategoryPill
          transactionId={transactionId}
          currentCategoryId={split.categoryId || null}
          currentCategoryName={split.categoryName}
          categories={categories}
          onCategoryChange={handleCategoryChange}
        />
      </div>

      <CurrencyInput
        value={amount}
        onChange={setAmount}
        onBlur={handleAmountBlur}
        disabled={isPending}
        className="h-7 text-xs"
      />

      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        disabled={isPending}
        onClick={() => onDelete(split.id)}
      >
        <Trash2 className="size-3.5 text-muted-foreground" />
      </Button>
    </div>
  );
}
