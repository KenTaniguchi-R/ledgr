"use client";

import { centsToDisplay } from "@/lib/money";

export interface SummaryItem {
  label: string;
  value: number;
  format?: "currency" | "number" | "percent";
  color?: "default" | "income" | "expense" | "dynamic" | "safe-to-spend";
  secondaryLabel?: string;
}

interface ReportSummaryBarProps {
  items: SummaryItem[];
}

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

function getValueColor(item: SummaryItem): string {
  switch (item.color) {
    case "income":
      return "text-green-600 dark:text-green-500";
    case "expense":
      return "text-destructive";
    case "dynamic":
      return item.value >= 0
        ? "text-green-600 dark:text-green-500"
        : "text-destructive";
    case "safe-to-spend": {
      if (item.value <= 0) return "text-destructive";
      return "text-green-600 dark:text-green-500";
    }
    default:
      return "";
  }
}

export function ReportSummaryBar({ items }: ReportSummaryBarProps) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 5)}, 1fr)` }}>
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">{item.label}</div>
          <div className={`text-lg font-semibold tabular-nums ${getValueColor(item)}`}>
            {formatValue(item.value, item.format)}
          </div>
          {item.secondaryLabel && (
            <div className="text-xs text-muted-foreground mt-0.5">{item.secondaryLabel}</div>
          )}
        </div>
      ))}
    </div>
  );
}
