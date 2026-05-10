"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { bulkUpdateCategory, bulkMarkReviewed } from "@/actions/transactions";
import type { CategoryGroup } from "@/queries/categories";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
} from "@/components/ui/select";
import { CategorySelectItems } from "@/components/molecules/category-select-items";

interface BulkActionBarProps {
  selectedIds: string[];
  categories: CategoryGroup[];
  onComplete: () => void;
}

export function BulkActionBar({ selectedIds, categories, onComplete }: BulkActionBarProps) {
  const [isPending, startTransition] = useTransition();

  function handleCategorize(categoryId: string | null) {
    if (!categoryId) return;
    const resolvedId = categoryId === "uncategorized" ? null : categoryId;
    startTransition(async () => {
      await bulkUpdateCategory(selectedIds, resolvedId);
      onComplete();
    });
  }

  function handleMarkReviewed() {
    startTransition(async () => {
      await bulkMarkReviewed(selectedIds, true);
      onComplete();
    });
  }

  return (
    <div className="sticky top-14 z-20 flex items-center gap-3 bg-muted/80 backdrop-blur-sm border rounded-md px-3 py-2 mb-2">
      <span className="text-sm font-medium">{selectedIds.length} selected</span>

      <Select onValueChange={handleCategorize} disabled={isPending}>
        <SelectTrigger className="h-7 w-[160px] text-xs">
          <SelectValue placeholder="Set category..." />
        </SelectTrigger>
        <SelectContent>
          <CategorySelectItems categories={categories} />
        </SelectContent>
      </Select>

      <Button variant="outline" size="sm" onClick={handleMarkReviewed} disabled={isPending}>
        Mark Reviewed
      </Button>
    </div>
  );
}
