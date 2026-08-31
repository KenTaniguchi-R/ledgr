import { AmountDisplay } from "@/components/atoms/amount-display";
import { BillStatusIndicator } from "@/components/atoms/bill-status-indicator";
import { Badge } from "@/components/ui/badge";
import { categoryLabel } from "@/lib/labels";
import type { BillRow as BillRowType } from "@/queries/recurring";

interface BillRowProps {
  bill: BillRowType;
  onSelect: () => void;
}

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  semimonthly: "2x/mo",
  monthly: "Monthly",
  yearly: "Yearly",
};

export function BillRow({ bill, onSelect }: BillRowProps) {
  return (
    // The whole row is clickable for pointer users, but the accessible control
    // is the real <button> in the name cell: a click handler on <tr> alone is
    // unreachable by keyboard, and wrapping the row in a <button> would
    // destroy the table semantics screen readers need to pair cells with
    // their column headers.
    <tr
      onClick={onSelect}
      className="cursor-pointer border-b border-border/50 last:border-b-0 hover:bg-accent"
    >
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          aria-label={`Edit ${bill.name}`}
          className="max-w-full truncate rounded text-left font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          {bill.name}
        </button>
      </td>
      <td className="max-w-[160px] truncate px-3 py-2 text-xs text-muted-foreground">
        {categoryLabel(bill.categoryName)}
      </td>
      <td className="px-3 py-2 text-right">
        {bill.averageAmount !== null && (
          <AmountDisplay amount={bill.averageAmount} absolute />
        )}
      </td>
      <td className="px-3 py-2">
        {bill.frequency && (
          <Badge variant="outline" className="text-xs font-normal">
            {FREQUENCY_LABELS[bill.frequency] ?? bill.frequency}
          </Badge>
        )}
      </td>
      <td className="px-3 py-2">
        <span className="flex justify-end">
          <BillStatusIndicator status={bill.status} relativeDateLabel={bill.relativeDateLabel} />
        </span>
      </td>
    </tr>
  );
}
