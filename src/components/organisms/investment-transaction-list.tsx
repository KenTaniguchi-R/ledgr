"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { InvestmentTransactionRow } from "@/components/molecules/investment-transaction-row";
import { InvestmentFilters } from "@/components/molecules/investment-filters";
import { loadMoreInvestmentTransactions } from "@/actions/investments";
import type { InvTxnRow, InvestmentFilters as IFilters } from "@/queries/investments";

interface InvestmentTransactionListProps {
  initialRows: InvTxnRow[];
  initialCursor: string | null;
  filters: IFilters;
  accounts: { id: string; name: string }[];
}

export function InvestmentTransactionList({ initialRows, initialCursor, filters, accounts }: InvestmentTransactionListProps) {
  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(initialCursor);
  const [isPending, startTransition] = useTransition();

  function handleLoadMore() {
    if (!cursor) return;
    startTransition(async () => {
      const page = await loadMoreInvestmentTransactions(cursor, filters);
      setRows((prev) => [...prev, ...page.rows]);
      setCursor(page.nextCursor);
    });
  }

  return (
    <div className="space-y-2">
      <InvestmentFilters accounts={accounts} />
      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-[90px_70px_2fr_100px_100px] gap-2 items-center h-8 px-3 text-xs font-medium text-muted-foreground bg-muted/30 border-b">
          <span>Date</span><span>Type</span><span>Security</span><span className="text-right">Qty × Price</span><span className="text-right">Amount</span>
        </div>
        {rows.map((txn) => (<InvestmentTransactionRow key={txn.id} transaction={txn} />))}
        {rows.length === 0 && (
          <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">No investment transactions found.</div>
        )}
      </div>
      {cursor && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={isPending}>
            {isPending ? "Loading..." : "Load More"}
          </Button>
        </div>
      )}
    </div>
  );
}
