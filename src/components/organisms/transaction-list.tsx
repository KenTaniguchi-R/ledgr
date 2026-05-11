"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ReviewCardDialog } from "@/components/organisms/review-card-dialog";
import { TransactionRow, TRANSACTION_GRID_COLS } from "@/components/molecules/transaction-row";
import { TransactionDateHeader } from "@/components/molecules/transaction-date-header";
import { BulkActionBar } from "@/components/molecules/bulk-action-bar";
import { TransactionDetailPanel } from "@/components/organisms/transaction-detail-panel";
import { loadMoreTransactions } from "@/actions/transactions";
import { groupByDate } from "@/lib/transactions";
import { useSelectedTransaction } from "@/hooks/use-selected-transaction";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
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
  const isMobile = useIsMobile();
  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(nextCursor);
  const [prevInitialRows, setPrevInitialRows] = useState(initialRows);

  if (initialRows !== prevInitialRows) {
    setPrevInitialRows(initialRows);
    setRows(initialRows);
    setCursor(nextCursor);
  }

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const { selectedId, select, clear } = useSelectedTransaction();
  const urlSearchParams = useSearchParams();
  const isReviewMode = urlSearchParams.get("mode") === "review";

  const groups = useMemo(() => groupByDate(rows), [rows]);

  const selectedRow = useMemo(
    () => (selectedId ? rows.find((r) => r.id === selectedId) ?? null : null),
    [selectedId, rows],
  );

  const isPanelOpen = selectedId !== null;

  const handleSelect = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    if (checked && isPanelOpen) clear();
  }, [isPanelOpen, clear]);

  const handleSelectAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === rows.length) return new Set();
      return new Set(rows.map((r) => r.id));
    });
    if (isPanelOpen) clear();
  }, [rows, isPanelOpen, clear]);

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

  const handleTransactionUpdated = useCallback((updated: TxnRow) => {
    setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }, []);

  const handlePanelClose = useCallback(() => {
    clear();
  }, [clear]);

  const handleReviewDone = useCallback(() => {
    const params = new URLSearchParams(urlSearchParams.toString());
    params.delete("mode");
    router.push(`/transactions${params.toString() ? `?${params.toString()}` : ""}`);
  }, [router, urlSearchParams]);

  const hasBulkSelection = selected.size > 0;

  return (
    <div
      className={cn(
        "group/list grid transition-[grid-template-columns] duration-200 ease-out",
        isPanelOpen && !isMobile
          ? "grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
          : "grid-cols-[1fr]",
      )}
      data-bulk-active={hasBulkSelection ? "" : undefined}
    >
      {/* List Column */}
      <div className="min-w-0 overflow-hidden">
        {hasBulkSelection && (
          <BulkActionBar
            selectedIds={Array.from(selected)}
            categories={categories}
            onComplete={handleBulkComplete}
          />
        )}

        <div className={`grid ${TRANSACTION_GRID_COLS} items-center h-8 px-2 border-b text-xs font-medium text-muted-foreground`}>
          <div />
          <div className="hidden sm:flex items-center justify-center">
            <Checkbox
              checked={selected.size > 0 && selected.size === rows.length}
              indeterminate={selected.size > 0 && selected.size < rows.length}
              onCheckedChange={handleSelectAll}
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
                  isActive={txn.id === selectedId}
                  onSelect={handleSelect}
                  onClick={() => select(txn.id)}
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

      {/* Detail Panel Column */}
      {isPanelOpen && !isReviewMode && (
        <div
          className={cn(
            "border-l bg-background",
            isMobile
              ? "fixed inset-0 z-50"
              : "h-[calc(100vh-8rem)] sticky top-32",
          )}
        >
          {/* Live region for screen readers */}
          <div className="sr-only" aria-live="polite">
            Transaction details opened
          </div>
          <TransactionDetailPanel
            transactionId={selectedId}
            initialData={selectedRow}
            categories={categories}
            onClose={handlePanelClose}
            onTransactionUpdated={handleTransactionUpdated}
            onSelectTransaction={select}
          />
        </div>
      )}

      {isReviewMode && (
        <ReviewCardDialog
          rows={rows}
          categories={categories}
          onDone={handleReviewDone}
        />
      )}
    </div>
  );
}
