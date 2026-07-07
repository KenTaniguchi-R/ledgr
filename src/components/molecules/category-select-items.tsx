import {
  SelectItem,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { CategoryIcon } from "@/components/atoms/category-icon";
import type { CategoryGroup } from "@/queries/categories";

interface CategorySelectItemsProps {
  categories: CategoryGroup[];
}

export function CategorySelectItems({ categories }: CategorySelectItemsProps) {
  return (
    <>
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
              <span className="flex items-center gap-2">
                {cat.icon && (
                  <CategoryIcon name={cat.icon} size={14} className="text-muted-foreground shrink-0" />
                )}
                {cat.name}
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      ))}
    </>
  );
}
