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

export function ReportSummaryBar({ items }: ReportSummaryBarProps) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 5)}, 1fr)` }}
    >
      {items.map((item) => {
        const tone = resolveTone(item);
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className="flex items-center gap-3 rounded-lg border p-3"
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
