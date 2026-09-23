"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { TransactionRow } from "@/components/molecules/transaction-row";
import { BulkActionBar } from "@/components/molecules/bulk-action-bar";
import { TransactionDetailPanel } from "@/components/organisms/transaction-detail-panel";
import { getDrillDownTransactions } from "@/actions/reports";
import { updateTransactionFields } from "@/actions/transaction-detail";
import { drillDownTransactionsUrl } from "@/lib/drill-down-url";
import { drillDownExitReason } from "@/lib/drill-down-exit";
import { groupByDate } from "@/lib/transactions";
import { formatDateShort } from "@/lib/date-utils";
import { centsToDisplay } from "@/lib/money";
import type { TransactionRow as TxnRow } from "@/queries/transactions";
import type { CategoryGroup } from "@/queries/categories";

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
  categories: CategoryGroup[];
  onClose: () => void;
}

/**
 * The transactions behind one figure on the Reports page, editable the same
 * way the Transactions page is: category pill and quick-hide on each row, the
 * bulk bar for a selection, and the full detail panel on click.
 *
 * Edits land in local state. Rows an edit moves out of the drill-down stay in
 * place, dimmed, so ↑↓ stepping and the user's sense of place survive; the
 * header total drops at once. The report behind the sheet is refreshed once, on
 * close, rather than repainting its chart under the user on every edit.
 */
export function DrillDownSheet({ filter, dateFrom, dateTo, accountIds, categories, onClose }: DrillDownSheetProps) {
  const router = useRouter();
  // Depend on the contents, not the array identity: the parent re-renders on
  // every drill-down open and would otherwise hand us a fresh array each time.
  const accountKey = accountIds?.join(",") ?? "";
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<TxnRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Set by any edit; read on close to decide whether the report needs a refresh.
  const dirty = useRef(false);

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
  }, [filter, effectiveDateFrom, effectiveDateTo, accountKey, reloadKey]);

  // A new drill-down starts clean.
  const [filterFor, setFilterFor] = useState(filter);
  if (filterFor !== filter) {
    setFilterFor(filter);
    setSelected(new Set());
    setOpenId(null);
  }

  const exitReasons = useMemo(() => {
    const map = new Map<string, string>();
    if (!filter) return map;
    for (const r of rows) {
      const reason = drillDownExitReason(r, filter.categoryId);
      if (reason) map.set(r.id, reason);
    }
    return map;
  }, [rows, filter]);

  const exitedTotal = useMemo(
    () => rows.reduce((s, r) => (exitReasons.has(r.id) ? s + Math.abs(r.normalizedAmount) : s), 0),
    [rows, exitReasons],
  );
  const liveTotal = total - exitedTotal;
  const liveCount = matchCount - exitReasons.size;

  const groups = useMemo(() => groupByDate(rows), [rows]);
  const openIndex = openId ? rows.findIndex((r) => r.id === openId) : -1;
  const openRow = openIndex >= 0 ? rows[openIndex] : null;

  const stepPrev = useMemo(
    () => (openIndex > 0 ? () => setOpenId(rows[openIndex - 1].id) : null),
    [openIndex, rows],
  );
  const stepNext = useMemo(
    () => (openIndex >= 0 && openIndex < rows.length - 1 ? () => setOpenId(rows[openIndex + 1].id) : null),
    [openIndex, rows],
  );

  const patchRow = useCallback((id: string, patch: Partial<TxnRow>) => {
    dirty.current = true;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const handleTransactionUpdated = useCallback((updated: TxnRow) => {
    dirty.current = true;
    setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }, []);

  const handleCategoryUpdated = useCallback(
    (id: string, categoryId: string | null, categoryName: string | null) => patchRow(id, { categoryId, categoryName }),
    [patchRow],
  );

  const handleReviewedUpdated = useCallback(
    (id: string, reviewed: boolean) => patchRow(id, { reviewed }),
    [patchRow],
  );

  const handleHide = useCallback(
    (id: string) => {
      patchRow(id, { isHidden: true });
      updateTransactionFields(id, { isHidden: true }).then((result) => {
        if ("error" in result) patchRow(id, { isHidden: false });
      });
    },
    [patchRow],
  );

  const handleSelect = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // The bulk bar doesn't report what it set, so reload rather than guess.
  // Rows it moved out of the drill-down drop out with the reload.
  const handleBulkComplete = useCallback(() => {
    dirty.current = true;
    setSelected(new Set());
    setReloadKey((k) => k + 1);
  }, []);

  const closeDetail = useCallback(() => setOpenId(null), []);

  function handleClose() {
    setOpenId(null);
    setSelected(new Set());
    if (dirty.current) {
      dirty.current = false;
      router.refresh();
    }
    onClose();
  }

  const txnPageUrl = filter
    ? drillDownTransactionsUrl({
        categoryId: filter.categoryId,
        month: filter.month,
        dateFrom,
        dateTo,
      })
    : "/transactions";

  return (
    <Sheet
      open={!!filter}
      onOpenChange={(open, details) => {
        if (open) return;
        // Escape belongs to the detail panel while it is open: it goes back
        // to the list instead of dismissing the whole sheet.
        if (openId && details.reason === "escape-key") {
          details.cancel();
          setOpenId(null);
          return;
        }
        handleClose();
      }}
    >
      <SheetContent className="w-full sm:w-[600px] data-[side=right]:sm:max-w-[600px] flex flex-col gap-0">
        <SheetHeader className="border-b">
          <div className="text-xs text-muted-foreground">{filter?.tabContext}</div>
          <SheetTitle className="text-base">
            {filter?.categoryName}
          </SheetTitle>
          {!isPending && matchCount > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground tabular-nums">
              <span>{centsToDisplay(liveTotal)}</span>
              <span>
                {liveCount} {liveCount === 1 ? "transaction" : "transactions"}
              </span>
              {exitReasons.size > 0 && (
                <span className="text-positive">✓ {exitReasons.size} done</span>
              )}
            </div>
          )}
        </SheetHeader>

        {openId ? (
          <div className="min-h-0 flex-1">
            <TransactionDetailPanel
              transactionId={openId}
              initialData={openRow}
              categories={categories}
              onClose={closeDetail}
              onTransactionUpdated={handleTransactionUpdated}
              onSelectTransaction={setOpenId}
              onStepPrev={stepPrev}
              onStepNext={stepNext}
            />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto pb-2">
            {isPending ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                No transactions found.
              </div>
            ) : (
              <>
                {selected.size > 0 && (
                  <BulkActionBar
                    selectedIds={Array.from(selected)}
                    categories={categories}
                    onComplete={handleBulkComplete}
                    className="top-0 mx-2 mt-2"
                  />
                )}
                {hasMore && (
                  <div className="px-4 pt-3 pb-1 text-xs text-muted-foreground">
                    Showing the most recent {rows.length} of {matchCount}
                  </div>
                )}
                {groups.map((group) => (
                  <div key={group.date}>
                    <div className="sticky top-0 z-10 border-b bg-popover px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {formatDateShort(group.date)}
                    </div>
                    {group.rows.map((txn) => (
                      <TransactionRow
                        key={txn.id}
                        transaction={txn}
                        categories={categories}
                        isSelected={selected.has(txn.id)}
                        onSelect={handleSelect}
                        onClick={() => setOpenId(txn.id)}
                        onHide={exitReasons.has(txn.id) ? undefined : handleHide}
                        onCategoryUpdated={handleCategoryUpdated}
                        onReviewedUpdated={handleReviewedUpdated}
                        compact
                        exitReason={exitReasons.get(txn.id) ?? null}
                      />
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

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
