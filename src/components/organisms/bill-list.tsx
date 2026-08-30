"use client";

import { useState } from "react";
import { BillRow } from "@/components/molecules/bill-row";
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
      {/* The columns need roughly 560px to stay legible. Previously they were
          fixed widths with no breakpoint and no scroll container, so the whole
          page scrolled sideways on a phone (body scrollWidth 592 at 390px).
          Scrolling inside this container is the pattern Investments uses. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b text-xs font-medium text-muted-foreground">
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Name
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Category
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Amount
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Frequency
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {bills.map((bill) => (
              <BillRow key={bill.id} bill={bill} onSelect={() => setSelected(bill)} />
            ))}
          </tbody>
        </table>
      </div>

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
