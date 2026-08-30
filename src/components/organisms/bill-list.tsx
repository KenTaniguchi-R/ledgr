"use client";

import { useState } from "react";
import { BillRow, BILL_ROW_GRID } from "@/components/molecules/bill-row";
import { BillDetailSheet } from "@/components/organisms/bill-detail-sheet";
import type { BillRow as BillRowType } from "@/queries/recurring";
import type { CategoryGroup } from "@/queries/categories";

interface BillListProps {
  bills: BillRowType[];
  categoryGroups: CategoryGroup[];
}

export function BillList({ bills, categoryGroups }: BillListProps) {
  const [selected, setSelected] = useState<BillRowType | null>(null);

  return (
    <div>
      <div
        className={`${BILL_ROW_GRID} h-8 px-3 text-xs font-medium text-muted-foreground border-b`}
      >
        <span>Name</span>
        <span>Category</span>
        <span className="text-right">Amount</span>
        <span>Frequency</span>
        <span className="text-right">Status</span>
      </div>
      {bills.map((bill) => (
        <BillRow key={bill.id} bill={bill} onSelect={() => setSelected(bill)} />
      ))}

      {/* Keyed so opening another bill remounts the sheet and its form
          re-seeds, rather than syncing props into state from an effect. */}
      {selected && (
        <BillDetailSheet
          key={selected.id}
          bill={selected}
          categoryGroups={categoryGroups}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
