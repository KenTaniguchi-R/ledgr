import {
  SelectItem,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
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
              {cat.icon ? `${cat.icon} ` : ""}{cat.name}
            </SelectItem>
          ))}
        </SelectGroup>
      ))}
    </>
  );
}
