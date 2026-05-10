import { BillRow } from "@/components/molecules/bill-row";
import type { BillRow as BillRowType } from "@/queries/recurring";

interface BillListProps {
  bills: BillRowType[];
}

export function BillList({ bills }: BillListProps) {
  return (
    <div>
      <div className="grid grid-cols-[1fr_140px_100px_100px_120px] items-center h-8 px-3 text-xs font-medium text-muted-foreground border-b">
        <span>Name</span>
        <span>Category</span>
        <span className="text-right">Amount</span>
        <span>Frequency</span>
        <span className="text-right">Status</span>
      </div>
      {bills.map((bill) => (
        <BillRow key={bill.id} bill={bill} />
      ))}
    </div>
  );
}
