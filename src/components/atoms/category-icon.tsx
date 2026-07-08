import type { CSSProperties } from "react";
import {
  type LucideIcon,
  Tag,
  Banknote,
  Car,
  CarFront,
  CircleDollarSign,
  Clapperboard,
  Coffee,
  Cpu,
  DollarSign,
  Droplet,
  Dumbbell,
  Fuel,
  Gift,
  GraduationCap,
  Heart,
  HeartPulse,
  Home,
  Key,
  Lamp,
  Landmark,
  Laptop,
  Pill,
  Plane,
  Repeat,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  SquareParking,
  Stethoscope,
  TrainFront,
  TrendingUp,
  Umbrella,
  User,
  Utensils,
  Wifi,
  Wrench,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CategoryIconProps {
  /** Kebab-case lucide icon name (e.g. "utensils"). Falls back to a generic Tag when null/unknown. */
  name: string | null | undefined;
  size?: number;
  className?: string;
}

/**
 * Static map of the category/group icon names written by the seed
 * (src/db/seed/categories.ts) to their lucide components. Category icons are
 * a bounded, seed-only set, so a static map avoids lucide's dynamic-import
 * manifest (~1,500 entries) and the per-icon fetch waterfall, and renders on
 * the server. Keep this in sync with the seed; unknown names fall back to Tag.
 */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  banknote: Banknote,
  car: Car,
  "car-front": CarFront,
  "circle-dollar-sign": CircleDollarSign,
  clapperboard: Clapperboard,
  coffee: Coffee,
  cpu: Cpu,
  "dollar-sign": DollarSign,
  droplet: Droplet,
  dumbbell: Dumbbell,
  fuel: Fuel,
  gift: Gift,
  "graduation-cap": GraduationCap,
  heart: Heart,
  "heart-pulse": HeartPulse,
  home: Home,
  key: Key,
  lamp: Lamp,
  landmark: Landmark,
  laptop: Laptop,
  pill: Pill,
  plane: Plane,
  repeat: Repeat,
  shirt: Shirt,
  "shopping-bag": ShoppingBag,
  "shopping-cart": ShoppingCart,
  smartphone: Smartphone,
  "square-parking": SquareParking,
  stethoscope: Stethoscope,
  "train-front": TrainFront,
  "trending-up": TrendingUp,
  umbrella: Umbrella,
  user: User,
  utensils: Utensils,
  wifi: Wifi,
  wrench: Wrench,
  zap: Zap,
};

/**
 * Renders a category or category-group icon from its stored lucide name,
 * falling back to a generic Tag for missing or unrecognized names.
 */
export function CategoryIcon({ name, size = 16, className }: CategoryIconProps) {
  const Icon = (name && CATEGORY_ICONS[name]) || Tag;
  return <Icon size={size} className={className} />;
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
