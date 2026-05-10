"use client";

import Link from "next/link";
import { centsToDisplay } from "@/lib/money";
import type { BillRow } from "@/queries/recurring";

interface UpcomingBillsWidgetProps {
  data: BillRow[];
}

export function UpcomingBillsWidget({ data }: UpcomingBillsWidgetProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No upcoming bills
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 space-y-1">
        {data.map((bill) => (
          <div
            key={bill.id}
            className="flex items-center justify-between text-sm px-1 py-1"
          >
            <span className="truncate flex-1 min-w-0">{bill.name}</span>
            <span className="tabular-nums text-muted-foreground ml-2 shrink-0">
              {bill.averageAmount !== null
                ? centsToDisplay(bill.averageAmount)
                : "—"}
            </span>
            <span className="text-xs text-muted-foreground ml-3 w-16 text-right shrink-0">
              {bill.relativeDateLabel ?? "—"}
            </span>
          </div>
        ))}
      </div>
      <Link
        href="/bills"
        className="text-xs text-primary hover:underline mt-2 text-center"
      >
        View all bills
      </Link>
    </div>
  );
}
