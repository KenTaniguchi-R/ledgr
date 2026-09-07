"use client";

import { useState } from "react";
import { BillRow } from "@/components/molecules/bill-row";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
      {/* The columns need roughly 560px to stay legible; below that they scroll
          inside Table's own container rather than pushing the page sideways
          (body scrollWidth 592 at 390px, before this had a scroll parent). */}
      <Table className="min-w-[560px]">
        <TableHeader>
          <TableRow className="text-xs font-medium text-muted-foreground hover:bg-transparent">
            <TableHead scope="col" className="text-left font-medium">
              Name
            </TableHead>
            <TableHead scope="col" className="text-left font-medium">
              Category
            </TableHead>
            <TableHead scope="col" className="text-right font-medium">
              Amount
            </TableHead>
            <TableHead scope="col" className="text-left font-medium">
              Frequency
            </TableHead>
            <TableHead scope="col" className="text-right font-medium">
              Status
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bills.map((bill) => (
            <BillRow key={bill.id} bill={bill} onSelect={() => setSelected(bill)} />
          ))}
        </TableBody>
      </Table>

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
