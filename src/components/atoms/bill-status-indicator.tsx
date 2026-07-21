import { cn } from "@/lib/utils";
import type { BillStatus } from "@/lib/date-utils";

interface BillStatusIndicatorProps {
  status: BillStatus;
  relativeDateLabel?: string | null;
}

const STATUS_CLASSES: Record<BillStatus, string> = {
  overdue: "bg-destructive/10 text-destructive",
  "due-soon": "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  upcoming: "bg-muted text-muted-foreground",
  inactive: "bg-muted text-muted-foreground",
};

function chipLabel(status: BillStatus, relativeDateLabel?: string | null): string {
  switch (status) {
    case "overdue": {
      const recency = relativeDateLabel?.replace(/\s*overdue$/i, "");
      return recency ? `Overdue · ${recency}` : "Overdue";
    }
    case "due-soon":
      return relativeDateLabel ? `Due ${relativeDateLabel}` : "Due soon";
    case "upcoming":
      return relativeDateLabel ?? "Upcoming";
    case "inactive":
      return "Paused";
  }
}

export function BillStatusIndicator({ status, relativeDateLabel }: BillStatusIndicatorProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_CLASSES[status],
      )}
    >
      {chipLabel(status, relativeDateLabel)}
    </span>
  );
}
