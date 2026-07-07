"use client";

import { useState } from "react";
import { useActionTransition } from "@/hooks/use-action-transition";
import { updateTransactionCategory } from "@/actions/transactions";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty } from "@/components/ui/command";
import { CategoryCommandItems } from "@/components/molecules/category-command-items";
import { categoryPillLabel } from "@/components/molecules/category-pill-label";
import type { CategoryGroup } from "@/queries/categories";
import { cn } from "@/lib/utils";

interface CategoryPillProps {
  transactionId: string;
  currentCategoryId: string | null;
  currentCategoryName: string | null;
  categories: CategoryGroup[];
  disabled?: boolean;
  isTransfer?: boolean;
  onCategoryChange?: (categoryId: string | null, categoryName: string | null) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CategoryPill({
  transactionId,
  currentCategoryName,
  categories,
  disabled = false,
  isTransfer = false,
  onCategoryChange,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: CategoryPillProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [categoryName, setCategoryName] = useState(currentCategoryName);
  const { isPending, execute } = useActionTransition();

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled
    ? (v: boolean) => controlledOnOpenChange?.(v)
    : setInternalOpen;

  const totalCategoryCount = categories.reduce((sum, g) => sum + g.categories.length, 0);

  function handleSelect(categoryId: string | null) {
    const prevName = categoryName;
    const newName = categoryId
      ? categories.flatMap((g) => g.categories).find((c) => c.id === categoryId)?.name ?? null
      : null;

    setCategoryName(newName);
    setOpen(false);

    if (onCategoryChange) {
      onCategoryChange(categoryId, newName);
      return;
    }

    execute(async () => {
      const result = await updateTransactionCategory(transactionId, categoryId);
      if ("error" in result) {
        setCategoryName(prevName);
      }
      return result;
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            disabled={disabled || isPending}
            className={cn(
              "max-w-[140px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
              isPending && "opacity-50",
            )}
          />
        }
      >
        <Badge variant="outline" className="text-xs truncate">
          {(() => {
            const { text, variant } = categoryPillLabel(categoryName, isTransfer);
            if (variant === "category") return text;
            return (
              <span className={cn("text-muted-foreground", variant === "uncategorized" && "italic")}>
                {text}
              </span>
            );
          })()}
        </Badge>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[220px] p-0">
        <Command>
          {totalCategoryCount > 20 && (
            <CommandInput placeholder="Search categories..." />
          )}
          <CommandList>
            <CommandEmpty>No category found.</CommandEmpty>
            <CategoryCommandItems categories={categories} onSelect={handleSelect} />
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
