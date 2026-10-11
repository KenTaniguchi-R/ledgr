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
import { groupByDate } from "@/lib/transactions";
import { summarizeDay } from "@/lib/transaction-day-summary";
import { useSelectedTransaction } from "@/hooks/use-selected-transaction";
import { useTransactionRows } from "@/hooks/use-transaction-rows";
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
  const { rows: allRows, setRows, patchRow, appendRows, setHidden } = useTransactionRows(initialRows);
  const [cursor, setCursor] = useState(nextCursor);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // `router.refresh()` re-runs the server component and hands this component
  // fresh `initialRows`/`nextCursor` props, but `useState` only reads its
  // initializer on mount — without this, every flow that leans on refresh()
  // to show a server-side change (bulk actions, exiting Review, exiting
  // transfer review) silently no-ops until a full page reload. Adjusted
  // during render, the same way splitsOpenFor is reset in the detail panel,
  // rather than in an effect, so it only fires on a real prop change and
  // doesn't clobber in-flight local optimistic updates.
  const [syncedInitialRows, setSyncedInitialRows] = useState(initialRows);
  if (syncedInitialRows !== initialRows) {
    setSyncedInitialRows(initialRows);
    setRows(initialRows);
    setCursor(nextCursor);
  }
  const [loadingMore, setLoadingMore] = useState(false);
  const { selectedId, select, clear } = useSelectedTransaction();
  const urlSearchParams = useSearchParams();
  const mode = urlSearchParams.get("mode");
  const isReviewMode = mode === "review";
  const isTransferReviewMode = mode === "review-transfers";
  const showingHidden = filters.hidden === true;

  // The ledger shows either the hidden rows or everything else, never both.
  // Hiding a row only flips its flag; it drops out here, and comes back on its
  // own if the save fails and the flag flips back.
  const rows = useMemo(
    () => allRows.filter((r) => r.isHidden === showingHidden),
    [allRows, showingHidden],
  );

  const groups = useMemo(() => groupByDate(rows), [rows]);

  // From every row, not just the shown ones: hiding the open transaction from
  // the panel's own switch keeps the panel on it.
  const selectedRow = useMemo(
    () => (selectedId ? allRows.find((r) => r.id === selectedId) ?? null : null),
    [selectedId, allRows],
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
      appendRows(page.rows);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  function handleBulkComplete() {
    setSelected(new Set());
    router.refresh();
  }

  // Quick-hide from the row itself closes the panel if it was showing that
  // row; the row has left the list it was opened from.
  const handleHiddenChange = useCallback(
    (id: string, hidden: boolean) => {
      setHidden(id, hidden);
      if (selectedId === id) clear();
    },
    [setHidden, selectedId, clear],
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
                  onOpen={select}
                  onHiddenChange={handleHiddenChange}
                  onPatch={patchRow}
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
              onPatch={patchRow}
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
