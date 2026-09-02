import type { LucideIcon } from "lucide-react";
import { centsToDisplay } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface SummaryItem {
  label: string;
  value: number;
  format?: "currency" | "number" | "percent";
  color?: "default" | "income" | "expense" | "dynamic";
  secondaryLabel?: string;
  icon?: LucideIcon;
}

const GREEN = "text-green-600 dark:text-green-500";

function formatValue(value: number, format: SummaryItem["format"]): string {
  switch (format) {
    case "number":
      return value.toLocaleString();
    case "percent":
      return `${value.toFixed(1)}%`;
    default:
      return centsToDisplay(value);
  }
}

type Tone = "default" | "income" | "expense";

function resolveTone(item: SummaryItem): Tone {
  switch (item.color) {
    case "income":
      return "income";
    case "expense":
      return "expense";
    case "dynamic":
      return item.value >= 0 ? "income" : "expense";
    default:
      return "default";
  }
}

const VALUE_TONE: Record<Tone, string> = {
  income: GREEN,
  expense: "text-destructive",
  default: "",
};

const ICON_TONE: Record<Tone, string> = {
  income: "bg-green-600/10 text-green-600 dark:text-green-500",
  expense: "bg-destructive/10 text-destructive",
  default: "bg-muted text-muted-foreground",
};

interface ReportSummaryBarProps {
  items: SummaryItem[];
}

/**
 * An inline `gridTemplateColumns` is unreachable by any breakpoint, so the bar
 * kept its desktop column count on a phone and pushed the page sideways —
 * squeezing the third tile down to its icon. Classes instead, so the count can
 * fall to one column on a narrow screen.
 */
const COLUMNS_AT_WIDE: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
};

export function ReportSummaryBar({ items }: ReportSummaryBarProps) {
  const columns = COLUMNS_AT_WIDE[Math.min(items.length, 5)] ?? "lg:grid-cols-5";
  return (
    <div className={cn("grid gap-4 grid-cols-1 sm:grid-cols-2", columns)}>
      {items.map((item) => {
        const tone = resolveTone(item);
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className="flex min-w-0 items-center gap-3 rounded-lg border p-3"
          >
            {Icon && (
              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-md",
                  ICON_TONE[tone]
                )}
              >
                <Icon className="size-[18px]" strokeWidth={2} />
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-xs text-muted-foreground">{item.label}</div>
              <div
                className={cn(
                  "text-lg font-semibold tabular-nums",
                  VALUE_TONE[tone]
                )}
              >
                {formatValue(item.value, item.format)}
              </div>
              {item.secondaryLabel && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {item.secondaryLabel}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
