"use client";

import { useState, useTransition } from "react";
import { updateTransactionCategory } from "@/actions/transactions";
import type { CategoryGroup } from "@/queries/categories";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";

interface CategoryPickerProps {
  transactionId: string;
  currentCategoryId: string | null;
  currentCategoryName: string | null;
  categories: CategoryGroup[];
  disabled?: boolean;
}

export function CategoryPicker({
  transactionId,
  currentCategoryId,
  currentCategoryName,
  categories,
  disabled = false,
}: CategoryPickerProps) {
  const [value, setValue] = useState(currentCategoryId ?? "uncategorized");
  const [isPending, startTransition] = useTransition();

  function handleChange(newValue: string | null) {
    if (!newValue) return;
    const prevValue = value;
    const categoryId = newValue === "uncategorized" ? null : newValue;
    setValue(newValue);

    startTransition(async () => {
      const result = await updateTransactionCategory(transactionId, categoryId);
      if ("error" in result) {
        setValue(prevValue);
      }
    });
  }

  return (
    <Select value={value} onValueChange={handleChange} disabled={disabled || isPending}>
      <SelectTrigger className="h-7 w-[140px] text-xs px-2">
        <SelectValue>
          {value === "uncategorized" ? (
            <span className="text-muted-foreground italic">Uncategorized</span>
          ) : (
            currentCategoryName ?? "Select..."
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="uncategorized">
          <span className="italic text-muted-foreground">Uncategorized</span>
        </SelectItem>
        {categories.map((group) => (
          <SelectGroup key={group.id}>
            <SelectLabel className="text-xs font-semibold text-muted-foreground px-2 py-1">
              {group.name}
            </SelectLabel>
            {group.categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.icon ? `${cat.icon} ` : ""}{cat.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
