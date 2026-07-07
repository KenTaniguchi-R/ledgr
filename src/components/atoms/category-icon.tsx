import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { Tag } from "lucide-react";

interface CategoryIconProps {
  /** Kebab-case lucide icon name (e.g. "utensils"). Falls back to a generic Tag when null/unknown. */
  name: string | null | undefined;
  size?: number;
  className?: string;
}

/**
 * Renders a category or category-group icon from its stored lucide name.
 * Icon names live in the DB (see src/db/seed/categories.ts) as kebab-case
 * lucide identifiers and are resolved at render time via lucide's dynamic
 * loader, with a Tag fallback for missing or unrecognized names.
 */
export function CategoryIcon({ name, size = 16, className }: CategoryIconProps) {
  if (!name) return <Tag size={size} className={className} />;
  return (
    <DynamicIcon
      name={name as IconName}
      size={size}
      className={className}
      fallback={() => <Tag size={size} className={className} />}
    />
  );
}
