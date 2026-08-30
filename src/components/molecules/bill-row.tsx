import { AmountDisplay } from "@/components/atoms/amount-display";
import { BillStatusIndicator } from "@/components/atoms/bill-status-indicator";
import { Badge } from "@/components/ui/badge";
import { categoryLabel } from "@/lib/labels";
import type { BillRow as BillRowType } from "@/queries/recurring";

interface BillRowProps {
  bill: BillRowType;
  onSelect: () => void;
}

export const BILL_ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_140px_110px_100px_150px] items-center gap-x-4";

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  semimonthly: "2x/mo",
  monthly: "Monthly",
  yearly: "Yearly",
};

export function BillRow({ bill, onSelect }: BillRowProps) {
  return (
    // A real <button>, not a div with a click handler: bills were previously
    // inert, and keyboard users need to reach the editor too.
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Edit ${bill.name}`}
      className={`${BILL_ROW_GRID} h-10 w-full px-3 text-left text-sm border-b border-border/50 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2`}
    >
      <span className="font-medium truncate">{bill.name}</span>
      <span className="text-muted-foreground truncate text-xs">
        {categoryLabel(bill.categoryName)}
      </span>
      <span className="text-right">
        {bill.averageAmount !== null && (
          <AmountDisplay amount={bill.averageAmount} absolute />
        )}
      </span>
      <span>
        {bill.frequency && (
          <Badge variant="outline" className="text-xs font-normal">
            {FREQUENCY_LABELS[bill.frequency] ?? bill.frequency}
          </Badge>
        )}
      </span>
      <span className="flex justify-end">
        <BillStatusIndicator status={bill.status} relativeDateLabel={bill.relativeDateLabel} />
      </span>
    </button>
  );
}
