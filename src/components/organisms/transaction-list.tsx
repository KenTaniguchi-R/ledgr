// src/components/organisms/transaction-list.tsx
"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TransactionRow, TRANSACTION_GRID_COLS } from "@/components/molecules/transaction-row";
import { TransactionDateHeader } from "@/components/molecules/transaction-date-header";
import { BulkActionBar } from "@/components/molecules/bulk-action-bar";
import { loadMoreTransactions } from "@/actions/transactions";
import { groupByDate } from "@/lib/transactions";
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

  const groups = useMemo(() => groupByDate(rows), [rows]);

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

  const hasBulkSelection = selected.size > 0;

  return (
    <div
      className="group/list"
      data-bulk-active={hasBulkSelection ? "" : undefined}
    >
      {hasBulkSelection && (
        <BulkActionBar
          selectedIds={Array.from(selected)}
          categories={categories}
          onComplete={handleBulkComplete}
        />
      )}

      <div className={`grid ${TRANSACTION_GRID_COLS} items-center h-8 px-2 border-b text-xs font-medium text-muted-foreground`}>
        <div />
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            checked={selected.size > 0 && selected.size === rows.length}
            onChange={handleSelectAll}
            className="h-3.5 w-3.5 rounded border-muted-foreground/30"
          />
        </div>
        <span>Description</span>
        <span>Category</span>
        <span className="text-right">Amount</span>
      </div>

      {groups.map((group) => {
        const netAmount = group.rows.reduce((sum, r) => sum + r.normalizedAmount, 0);
        return (
          <div key={group.date}>
            <TransactionDateHeader
              date={group.date}
              transactionCount={group.rows.length}
              netAmount={netAmount}
            />
            {group.rows.map((txn) => (
              <TransactionRow
                key={txn.id}
                transaction={txn}
                categories={categories}
                isSelected={selected.has(txn.id)}
                onSelect={handleSelect}
              />
            ))}
          </div>
        );
      })}

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
