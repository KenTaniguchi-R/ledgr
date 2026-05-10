"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TransactionRow } from "@/components/molecules/transaction-row";
import { BulkActionBar } from "@/components/molecules/bulk-action-bar";
import { loadMoreTransactions } from "@/actions/transactions";
import type { TransactionRow as TxnRow, TransactionFilters } from "@/queries/transactions";
import type { CategoryGroup } from "@/queries/categories";

interface TransactionListProps {
  initialRows: TxnRow[];
  nextCursor: string | null;
  categories: CategoryGroup[];
  filters: TransactionFilters;
}

export function TransactionList({
  initialRows,
  nextCursor,
  categories,
  filters,
}: TransactionListProps) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(nextCursor);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);

  const handleSelect = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.id)));
    }
  }, [rows, selected.size]);

  async function handleLoadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await loadMoreTransactions(filters, cursor);
      setRows((prev) => [...prev, ...page.rows]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  function handleBulkComplete() {
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div>
      {selected.size > 0 && (
        <BulkActionBar
          selectedIds={Array.from(selected)}
          categories={categories}
          onComplete={handleBulkComplete}
        />
      )}

      {/* Header row */}
      <div className="grid grid-cols-[32px_90px_1fr_140px_160px_100px_40px] items-center h-8 px-2 border-b text-xs font-medium text-muted-foreground">
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            checked={selected.size > 0 && selected.size === rows.length}
            onChange={handleSelectAll}
            className="h-3.5 w-3.5 rounded border-muted-foreground/30"
          />
        </div>
        <span>Date</span>
        <span>Description</span>
        <span>Account</span>
        <span>Category</span>
        <span className="text-right">Amount</span>
        <span className="text-center">Rev</span>
      </div>

      {/* Transaction rows */}
      {rows.map((txn) => (
        <TransactionRow
          key={txn.id}
          transaction={txn}
          categories={categories}
          isSelected={selected.has(txn.id)}
          onSelect={handleSelect}
        />
      ))}

      {/* Load more */}
      {cursor && (
        <div className="flex justify-center py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading..." : "Load More"}
          </Button>
        </div>
      )}
    </div>
  );
}
