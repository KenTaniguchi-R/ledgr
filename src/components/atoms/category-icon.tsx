import type { CSSProperties } from "react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { Tag } from "lucide-react";
import { cn } from "@/lib/utils";

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

interface CategoryIconTileProps {
  name: string | null | undefined;
  /** Pixel size of the glyph inside the tile. */
  iconSize?: number;
  /** Merged onto the base tile classes — pass `size-*` to override the default tile size. */
  className?: string;
  style?: CSSProperties;
}

/**
 * A CategoryIcon rendered inside the standard muted rounded tile used across
 * report and dashboard tables. Defaults to a size-8 tile; pass `className`
 * (e.g. "size-6") to resize and `style` to tint (e.g. chart-colored rows).
 */
export function CategoryIconTile({
  name,
  iconSize = 16,
  className,
  style,
}: CategoryIconTileProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground",
        className,
      )}
      style={style}
    >
      <CategoryIcon name={name} size={iconSize} />
    </span>
  );
}
