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
  SelectItem,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";

interface BulkActionBarProps {
  selectedIds: string[];
  categories: CategoryGroup[];
  onComplete: () => void;
}

export function BulkActionBar({ selectedIds, categories, onComplete }: BulkActionBarProps) {
  const [isPending, startTransition] = useTransition();

  function handleCategorize(categoryId: string) {
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
    <div className="sticky top-14 z-10 flex items-center gap-3 bg-muted/80 backdrop-blur-sm border rounded-md px-3 py-2 mb-2">
      <span className="text-sm font-medium">{selectedIds.length} selected</span>

      <Select onValueChange={handleCategorize} disabled={isPending}>
        <SelectTrigger className="h-7 w-[160px] text-xs">
          <SelectValue placeholder="Set category..." />
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

      <Button variant="outline" size="sm" onClick={handleMarkReviewed} disabled={isPending}>
        Mark Reviewed
      </Button>
    </div>
  );
}
