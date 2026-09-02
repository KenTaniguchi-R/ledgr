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
import { drillDownTransactionsUrl } from "@/lib/drill-down-url";
import { centsToDisplay } from "@/lib/money";
import type { TransactionRow } from "@/queries/transactions";

export interface DrillDownFilter {
  /** A category id, `null` for uncategorized, `undefined` for no category filter. */
  categoryId?: string | null;
  categoryName: string;
  month?: string;
  type?: "income" | "expense";
  tabContext: string;
}

interface DrillDownSheetProps {
  filter: DrillDownFilter | null;
  dateFrom: string;
  dateTo: string;
  accountIds?: string[];
  onClose: () => void;
}

export function DrillDownSheet({ filter, dateFrom, dateTo, accountIds, onClose }: DrillDownSheetProps) {
  // Depend on the contents, not the array identity: the parent re-renders on
  // every drill-down open and would otherwise hand us a fresh array each time.
  const accountKey = accountIds?.join(",") ?? "";
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [matchCount, setMatchCount] = useState(0);

  const effectiveDateFrom = filter?.month ? `${filter.month}-01` : dateFrom;
  const effectiveDateTo = filter?.month
    ? `${filter.month}-${new Date(Number(filter.month.slice(0, 4)), Number(filter.month.slice(5, 7)), 0).getDate()}`
    : dateTo;

  useEffect(() => {
    if (!filter) return;

    startTransition(async () => {
      const result = await getDrillDownTransactions({
        categoryId: filter.categoryId,
        dateFrom: effectiveDateFrom,
        dateTo: effectiveDateTo,
        accountIds: accountKey ? accountKey.split(",") : undefined,
        // The Spending tab has one side only, so an absent type means expense.
        type: filter.type ?? "expense",
      });
      setRows(result.rows);
      setHasMore(result.hasMore);
      setTotal(result.total);
      setMatchCount(result.matchCount);
    });
  // Depend on the filter object itself, not its fields: an uncategorized
  // drill-down carries `categoryId: null` alongside undefined month/type, which
  // is field-for-field identical to the closed (null filter) state, so a field
  // dependency list would never fire and the sheet would open empty.
  }, [filter, effectiveDateFrom, effectiveDateTo, accountKey]);

  const txnPageUrl = filter
    ? drillDownTransactionsUrl({
        categoryId: filter.categoryId,
        month: filter.month,
        dateFrom,
        dateTo,
      })
    : "/transactions";

  return (
    <Sheet open={!!filter} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[480px] sm:w-[600px] flex flex-col">
        <SheetHeader>
          <div className="text-xs text-muted-foreground">{filter?.tabContext}</div>
          <SheetTitle className="text-base">
            {filter?.categoryName}
          </SheetTitle>
          {!isPending && matchCount > 0 && (
            <div className="text-sm text-muted-foreground tabular-nums">
              {centsToDisplay(total)}
              <span className="ml-2 tabular-nums">
                {matchCount} {matchCount === 1 ? "transaction" : "transactions"}
              </span>
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto min-h-0 pb-2">
          {isPending ? (
            <div className="space-y-3 p-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <>
              {hasMore && (
                <div className="text-xs text-muted-foreground px-2 pb-2">
                  Showing the most recent {rows.length} of {matchCount}
                </div>
              )}
              <TransactionListPanel rows={rows} absoluteAmounts={filter?.tabContext === "Spending"} />
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
