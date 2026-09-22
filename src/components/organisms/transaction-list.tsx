"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ReviewCardDialog } from "@/components/organisms/review-card-dialog";
import { TransferReviewDialog } from "@/components/organisms/transfer-review-dialog";
import { TransactionRow, TRANSACTION_GRID_COLS } from "@/components/molecules/transaction-row";
import { TransactionDateHeader } from "@/components/molecules/transaction-date-header";
import { BulkActionBar } from "@/components/molecules/bulk-action-bar";
import { TransactionDetailPanel } from "@/components/organisms/transaction-detail-panel";
import { loadMoreTransactions } from "@/actions/transactions";
import { updateTransactionFields } from "@/actions/transaction-detail";
import { groupByDate } from "@/lib/transactions";
import { summarizeDay } from "@/lib/transaction-day-summary";
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
  suggestedTransfers?: TxnRow[];
}

export function TransactionList({
  initialRows,
  nextCursor,
  categories,
  filters,
  suggestedTransfers = [],
}: TransactionListProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(nextCursor);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const { selectedId, select, clear } = useSelectedTransaction();
  const urlSearchParams = useSearchParams();
  const mode = urlSearchParams.get("mode");
  const isReviewMode = mode === "review";
  const isTransferReviewMode = mode === "review-transfers";

  const groups = useMemo(() => groupByDate(rows), [rows]);

  const selectedRow = useMemo(
    () => (selectedId ? rows.find((r) => r.id === selectedId) ?? null : null),
    [selectedId, rows],
  );

  const isPanelOpen = selectedId !== null;

  // ↑↓ walks the ledger in the order it is rendered, across day boundaries —
  // the job on this screen is clearing a backlog, not inspecting one payment.
  const selectedIndex = useMemo(
    () => (selectedId ? rows.findIndex((r) => r.id === selectedId) : -1),
    [selectedId, rows],
  );

  const stepPrev = useMemo(
    () =>
      selectedIndex > 0 ? () => select(rows[selectedIndex - 1].id) : null,
    [selectedIndex, rows, select],
  );

  const stepNext = useMemo(
    () =>
      selectedIndex >= 0 && selectedIndex < rows.length - 1
        ? () => select(rows[selectedIndex + 1].id)
        : null,
    [selectedIndex, rows, select],
  );

  // Stepping with the arrow keys has to bring the row with it, or the
  // highlight walks off the top or bottom of the viewport unseen.
  useEffect(() => {
    if (!selectedId) return;
    document
      .querySelector(`[data-txn-row="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

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

  // Quick-hide from the row itself: since the default ledger view excludes
  // hidden rows, hiding one has to drop it from `rows` immediately rather
  // than wait for a refetch — the same reason the panel below closes when
  // it was showing the row being hidden.
  const handleHideTransaction = useCallback(
    (id: string) => {
      const prevRows = rows;
      setRows((prev) => prev.filter((r) => r.id !== id));
      if (selectedId === id) clear();

      updateTransactionFields(id, { isHidden: true }).then((result) => {
        if ("error" in result) setRows(prevRows);
      });
    },
    [rows, selectedId, clear],
  );

  const handlePanelClose = useCallback(() => {
    clear();
  }, [clear]);

  const handleReviewDone = useCallback(() => {
    const params = new URLSearchParams(urlSearchParams.toString());
    params.delete("mode");
    router.push(`/transactions${params.toString() ? `?${params.toString()}` : ""}`);
  }, [router, urlSearchParams]);

  const handleTransferReviewDone = handleReviewDone;

  const hasBulkSelection = selected.size > 0;

  return (
    <div
      className="group/list relative"
      data-bulk-active={hasBulkSelection ? "" : undefined}
    >
      {/* The ledger keeps the full content width whether or not the panel is
          open. It used to give up two fifths of it, which starved the `1fr`
          description track — the account and category tracks are fixed, so the
          description absorbed the whole loss and truncated to a few letters. */}
      <div className="min-w-0">
        {hasBulkSelection && (
          <BulkActionBar
            selectedIds={Array.from(selected)}
            categories={categories}
            onComplete={handleBulkComplete}
          />
        )}

        <div className={cn("grid items-center h-8 px-2 border-b text-xs font-medium text-muted-foreground", TRANSACTION_GRID_COLS)}>
          <div />
          <div className="hidden sm:flex items-center justify-center">
            <Checkbox
              checked={selected.size > 0 && selected.size === rows.length}
              indeterminate={selected.size > 0 && selected.size < rows.length}
              onCheckedChange={handleSelectAll}
            />
          </div>
          <span>Description</span>
          <span className="hidden lg:block">Account</span>
          <span>Category</span>
          <span className="text-right">Amount</span>
        </div>

        {groups.map((group) => {
          const summary = summarizeDay(group.rows);
          return (
            <div key={group.date}>
              <TransactionDateHeader date={group.date} summary={summary} />
              {group.rows.map((txn) => (
                <TransactionRow
                  key={txn.id}
                  transaction={txn}
                  categories={categories}
                  isSelected={selected.has(txn.id)}
                  isActive={txn.id === selectedId}
                  onSelect={handleSelect}
                  onClick={() => select(txn.id)}
                  onHide={handleHideTransaction}
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

      {/* Detail panel — floats above the ledger rather than taking a column
          out of it, so opening and closing it reflows nothing. The column is
          click-through; only the card itself takes the pointer. */}
      {isPanelOpen && !isReviewMode && !isTransferReviewMode && (
        <div
          className={cn(
            isMobile
              ? "fixed inset-0 z-50 bg-background"
              : "pointer-events-none absolute inset-y-0 right-0 z-30 w-[396px]",
          )}
        >
          {/* Live region for screen readers */}
          <div className="sr-only" aria-live="polite">
            Transaction details opened
          </div>
          <div
            className={cn(
              !isMobile &&
                "pointer-events-auto sticky top-4 max-h-[calc(100vh-2rem)] overflow-hidden rounded-xl bg-card shadow-2xl ring-1 ring-foreground/10",
              isMobile && "h-full",
            )}
          >
            <TransactionDetailPanel
              transactionId={selectedId}
              initialData={selectedRow}
              categories={categories}
              onClose={handlePanelClose}
              onTransactionUpdated={handleTransactionUpdated}
              onSelectTransaction={select}
              onStepPrev={stepPrev}
              onStepNext={stepNext}
            />
          </div>
        </div>
      )}

      {isReviewMode && (
        <ReviewCardDialog
          rows={rows}
          categories={categories}
          onDone={handleReviewDone}
        />
      )}

      {isTransferReviewMode && (
        <TransferReviewDialog
          rows={suggestedTransfers}
          onDone={handleTransferReviewDone}
        />
      )}
    </div>
  );
}
