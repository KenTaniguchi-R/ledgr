"use client";

import { useEffect, useTransition, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { TransactionListPanel } from "@/components/molecules/transaction-list-panel";
import { getDrillDownTransactions } from "@/actions/reports";
import { centsToDisplay } from "@/lib/money";
import type { TransactionRow } from "@/queries/transactions";

export interface DrillDownFilter {
  categoryId?: string;
  categoryName: string;
  month?: string;
  type?: "income" | "expense";
  tabContext: string;
}

interface DrillDownSheetProps {
  filter: DrillDownFilter | null;
  dateFrom: string;
  dateTo: string;
  onClose: () => void;
}

export function DrillDownSheet({ filter, dateFrom, dateTo, onClose }: DrillDownSheetProps) {
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    if (!filter) return;

    const effectiveDateFrom = filter.month ? `${filter.month}-01` : dateFrom;
    const effectiveDateTo = filter.month
      ? `${filter.month}-${new Date(Number(filter.month.slice(0, 4)), Number(filter.month.slice(5, 7)), 0).getDate()}`
      : dateTo;

    startTransition(async () => {
      const result = await getDrillDownTransactions({
        categoryId: filter.categoryId,
        dateFrom: effectiveDateFrom,
        dateTo: effectiveDateTo,
        type: filter.type,
      });
      setRows(result.rows);
      setTotalCount(result.totalCount);
    });
  }, [filter, dateFrom, dateTo]);

  const totalAmount = rows.reduce((s, r) => s + r.normalizedAmount, 0);

  const txnPageUrl = filter
    ? `/transactions?${new URLSearchParams({
        ...(filter.categoryId ? { category: filter.categoryId } : {}),
        from: filter.month ? `${filter.month}-01` : dateFrom,
        to: filter.month ? `${filter.month}-31` : dateTo,
      }).toString()}`
    : "/transactions";

  return (
    <Sheet open={!!filter} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[400px] sm:w-[540px] flex flex-col">
        <SheetHeader>
          <div className="text-xs text-muted-foreground">{filter?.tabContext}</div>
          <SheetTitle className="text-base">
            {filter?.categoryName}
          </SheetTitle>
          {!isPending && rows.length > 0 && (
            <div className="text-sm text-muted-foreground tabular-nums">
              {centsToDisplay(totalAmount)}
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto min-h-0 py-2">
          {isPending ? (
            <div className="space-y-3 p-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <>
              {totalCount > rows.length && (
                <div className="text-xs text-muted-foreground px-1 pb-2">
                  Showing {rows.length} of {totalCount} transactions
                </div>
              )}
              <TransactionListPanel rows={rows} />
            </>
          )}
        </div>

        <SheetFooter className="border-t pt-3">
          <Link
            href={txnPageUrl}
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            View all in Transactions
            <ExternalLink className="size-3" />
          </Link>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
