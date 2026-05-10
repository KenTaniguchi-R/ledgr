import { AmountDisplay } from "@/components/atoms/amount-display";
import { BillStatusIndicator } from "@/components/atoms/bill-status-indicator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BillRow as BillRowType } from "@/queries/recurring";

interface BillRowProps {
  bill: BillRowType;
}

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  semimonthly: "2x/mo",
  monthly: "Monthly",
  yearly: "Yearly",
};

export function BillRow({ bill }: BillRowProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_140px_100px_100px_120px] items-center h-10 px-3 text-sm border-b border-border/50",
        bill.status === "overdue" && "border-l-2 border-l-destructive",
      )}
    >
      <span className="font-medium truncate">{bill.name}</span>
      <span className="text-muted-foreground truncate text-xs">
        {bill.categoryName ?? "Uncategorized"}
      </span>
      <span className="text-right">
        {bill.averageAmount !== null && (
          <AmountDisplay amount={bill.averageAmount} />
        )}
      </span>
      <span>
        {bill.frequency && (
          <Badge variant="outline" className="text-xs font-normal">
            {FREQUENCY_LABELS[bill.frequency] ?? bill.frequency}
          </Badge>
        )}
      </span>
      <span className="flex flex-col items-end gap-0.5">
        <BillStatusIndicator status={bill.status} />
        {bill.relativeDateLabel && (
          <span className="text-[11px] text-muted-foreground">
            {bill.relativeDateLabel}
          </span>
        )}
      </span>
    </div>
  );
}
