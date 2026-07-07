"use client";

import {
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { CategoryIcon } from "@/components/atoms/category-icon";
import type { CategoryGroup } from "@/queries/categories";

interface CategoryCommandItemsProps {
  categories: CategoryGroup[];
  onSelect: (categoryId: string | null) => void;
}

export function CategoryCommandItems({ categories, onSelect }: CategoryCommandItemsProps) {
  return (
    <>
      <CommandItem onSelect={() => onSelect(null)}>
        <span className="italic text-muted-foreground">Uncategorized</span>
      </CommandItem>
      {categories.map((group) => (
        <CommandGroup key={group.id} heading={group.name}>
          {group.categories.map((cat) => (
            <CommandItem key={cat.id} onSelect={() => onSelect(cat.id)}>
              {cat.icon && (
                <CategoryIcon name={cat.icon} size={14} className="text-muted-foreground shrink-0" />
              )}
              {cat.name}
            </CommandItem>
          ))}
        </CommandGroup>
      ))}
    </>
  );
}
