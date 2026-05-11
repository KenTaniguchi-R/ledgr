import { cn } from "@/lib/utils";
import type { BillStatus } from "@/lib/date-utils";

interface BillStatusIndicatorProps {
  status: BillStatus;
}

const config: Record<BillStatus, { label: string; dotClass: string }> = {
  overdue: { label: "Overdue", dotClass: "bg-destructive" },
  "due-soon": { label: "Due soon", dotClass: "bg-amber-500" },
  upcoming: { label: "Upcoming", dotClass: "bg-muted-foreground/40" },
  inactive: { label: "Inactive", dotClass: "bg-muted-foreground/30" },
};

export function BillStatusIndicator({ status }: BillStatusIndicatorProps) {
  const { label, dotClass } = config[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", dotClass)} aria-hidden />
      {label}
    </span>
  );
}
