"use client";

import { accountDisplayName } from "@/lib/account-name";
import { memo, useCallback, useRef, useState } from "react";
import { Clock, Eye, EyeOff } from "lucide-react";
import { AmountDisplay } from "@/components/atoms/amount-display";
import { EntityAvatar } from "@/components/molecules/entity-avatar";
import { CategoryPill } from "@/components/molecules/category-pill";
import { ReviewedDot } from "@/components/molecules/reviewed-dot";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TransactionRow as TxnRow } from "@/queries/transactions";
import type { CategoryGroup } from "@/queries/categories";
import type { TransactionPatch } from "@/hooks/use-transaction-rows";
import { cn } from "@/lib/utils";

// Account is a column only at lg and up. The breakpoint is on the viewport but
// the grid lives inside the content area, which is a 256px sidebar narrower —
// at md the six tracks leave the description almost no width at all. Below lg
// the account stays an inline suffix on the description (sm-lg), and below sm
// it is dropped entirely; see the spans in the row body.
//
// The category track is bounded rather than `auto` wherever the account column
// exists: every row is its own grid, so an `auto` track resolves per row and
// the 1fr description absorbs the difference, which left the account starting
// at a different x on every line.
export const TRANSACTION_GRID_COLS =
  "grid-cols-[24px_minmax(0,1fr)_auto_80px] sm:grid-cols-[24px_32px_minmax(0,1fr)_auto_100px] lg:grid-cols-[24px_32px_minmax(0,1fr)_128px_minmax(0,150px)_100px]" as const;

// A sheet is ~600px wide at every viewport, so the ledger's viewport breakpoints
// would hand it the account column at lg and starve the description. Compact
// rows keep the sm layout throughout, with the account as an inline suffix.
const COMPACT_GRID_COLS =
  "grid-cols-[24px_minmax(0,1fr)_auto_80px] sm:grid-cols-[24px_32px_minmax(0,1fr)_minmax(0,140px)_92px]" as const;

interface TransactionRowProps {
  transaction: TxnRow;
  categories: CategoryGroup[];
  isSelected: boolean;
  isActive?: boolean;
  onSelect: (id: string, checked: boolean) => void;
  /** Opens the detail panel. Takes the id so the parent can pass one stable
   * callback to every row — an inline closure would defeat `memo`. */
  onOpen?: (id: string) => void;
  /** Hides the row without opening the detail panel — a quick declutter action. */
  onHiddenChange?: (id: string, hidden: boolean) => void;
  /** CategoryPill and ReviewedDot save themselves; this mirrors what they
   * saved into list state, so the detail panel doesn't reopen this row on the
   * pre-edit value. */
  onPatch?: (id: string, patch: TransactionPatch) => void;
  /** Sheet layout: no account column at any width. */
  compact?: boolean;
  /** Set when an edit moved this row out of the list it is shown in (see
   * drillDownExitReason); the row stays, dimmed, with this as its caption. */
  exitReason?: string | null;
}

// The reviewed dot, checkbox and category pill are controls inside a row that
// is itself a button; a click on them must not also open the panel.
function stopRowClick(e: React.MouseEvent) {
  e.stopPropagation();
}

export const TransactionRow = memo(function TransactionRow({
  transaction: txn,
  categories,
  isSelected,
  isActive = false,
  onSelect,
  onOpen,
  onHiddenChange,
  onPatch,
  compact = false,
  exitReason = null,
}: TransactionRowProps) {
  const id = txn.id;

  const handleOpen = useCallback(() => onOpen?.(id), [id, onOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen?.(id);
      }
    },
    [id, onOpen],
  );

  const handleCheckboxChange = useCallback(
    (checked: boolean) => onSelect(id, checked),
    [id, onSelect],
  );

  const handleHiddenClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onHiddenChange?.(id, !txn.isHidden);
    },
    [id, txn.isHidden, onHiddenChange],
  );

  const handleCategorySaved = useCallback(
    (categoryId: string | null, categoryName: string | null) =>
      onPatch?.(id, { categoryId, categoryName }),
    [id, onPatch],
  );

  const handleReviewedSaved = useCallback(
    (reviewed: boolean) => onPatch?.(id, { reviewed }),
    [id, onPatch],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      data-txn-row={id}
      className={cn(
        "group/row relative grid items-center h-11 sm:h-9 px-2 border-b border-border/50 text-sm hover:bg-muted/30 transition-colors cursor-pointer",
        compact ? COMPACT_GRID_COLS : TRANSACTION_GRID_COLS,
        (txn.pending || exitReason) && "opacity-60",
        isActive && "bg-muted",
      )}
    >
      {onHiddenChange && (
        <button
          type="button"
          onClick={handleHiddenClick}
          title={txn.isHidden ? "Unhide transaction" : "Hide transaction"}
          aria-label={txn.isHidden ? "Unhide transaction" : "Hide transaction"}
          className={cn(
            "absolute right-2 top-1/2 z-10 flex h-7 -translate-y-1/2 items-center justify-center gap-1 rounded-full border border-border bg-card shadow-sm transition-all hover:bg-muted",
            txn.isHidden
              ? "px-2 text-xs font-medium"
              : "w-7 scale-90 opacity-0 group-hover/row:scale-100 group-hover/row:opacity-100",
          )}
        >
          {txn.isHidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
          {txn.isHidden && <span>Unhide</span>}
        </button>
      )}

      <div onClick={stopRowClick}>
        <ReviewedDot
          key={`${id}-reviewed-${txn.reviewed}`}
          transactionId={id}
          reviewed={txn.reviewed}
          onSaved={handleReviewedSaved}
        />
      </div>

      <div className="hidden sm:flex items-center justify-center" onClick={stopRowClick}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={handleCheckboxChange}
        />
      </div>

      <TransactionDescription txn={txn} compact={compact} exitReason={exitReason} />

      <div className={cn("hidden min-w-0 pr-2 text-xs text-muted-foreground", !compact && "lg:block")}>
        <span className="block truncate">
          {txn.accountName && accountDisplayName(txn.accountName)}
        </span>
      </div>

      <div className="min-w-0" onClick={stopRowClick}>
        <CategoryPill
          key={`${id}-cat-${txn.categoryId}`}
          transactionId={id}
          currentCategoryId={txn.categoryId}
          currentCategoryName={txn.categoryName}
          categories={categories}
          disabled={txn.hasSplits}
          isTransfer={txn.isTransfer}
          transferSource={txn.transferSource}
          merchantId={txn.merchantId}
          merchantName={txn.merchantName}
          onSaved={handleCategorySaved}
        />
      </div>

      {/* Transfers recede by colour, not by `opacity-60` — that is already spent
          on `pending`, and stacking the two leaves a pending transfer barely
          readable. Muting the amount also drops its `text-positive` green,
          which a transfer into an account never earned. */}
      <div className="text-right">
        <AmountDisplay
          amount={txn.normalizedAmount}
          currency={txn.currency}
          pending={txn.pending}
          className={cn(txn.isTransfer && "font-normal text-muted-foreground")}
        />
      </div>
    </div>
  );
});

/** The description cell: avatar, name, and the status marks that ride along
 * with the name rather than taking a column of their own. */
function TransactionDescription({
  txn,
  compact,
  exitReason,
}: {
  txn: TxnRow;
  compact: boolean;
  exitReason: string | null;
}) {
  const note = txn.notes?.trim();
  return (
    <div className="flex items-center gap-1.5 pr-2 min-w-0">
      <EntityAvatar
        logoUrl={txn.merchantLogoUrl}
        name={txn.merchantName ?? txn.name}
        pfcPrimary={txn.pfcPrimary}
        size="sm"
        className={cn(txn.isTransfer && "opacity-60")}
      />
      <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
        {txn.pending && <Clock className="size-3 text-muted-foreground shrink-0" />}
        <span
          className={cn(
            "truncate",
            // Flex shrink is weighted by content width, so a long note would
            // still take a few pixels off the name; with a note, the name
            // holds its width and only the note gives way.
            note && "shrink-0 max-w-full",
            txn.isTransfer ? "font-normal text-muted-foreground" : "font-medium",
          )}
        >
          {txn.name}
        </span>
        {note && <RowNote note={note} />}
        {txn.isHidden && (
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">Hidden</Badge>
        )}
        {txn.originalName !== txn.name && (
          // Shrinks first, so revealing it on hover never squeezes the note
          // under the cursor — someone reading their own note outranks the
          // bank's wording, which the detail panel also shows.
          <span className="text-xs text-muted-foreground hidden group-hover/row:inline truncate shrink-[1000]">
            ({txn.originalName})
          </span>
        )}
        {exitReason ? (
          <span className="text-[11px] font-medium text-positive shrink-0">{exitReason}</span>
        ) : (
          <span
            className={cn(
              "hidden sm:inline text-[10px] text-muted-foreground shrink-0 max-w-[100px] truncate",
              !compact && "lg:hidden",
            )}
          >
            {txn.accountName && accountDisplayName(txn.accountName)}
          </span>
        )}
      </div>
    </div>
  );
}

function isTruncated(el: HTMLElement | null) {
  return el !== null && el.scrollWidth > el.clientWidth;
}

/** The note rides after the name in whatever width the name leaves it, giving
 * way before the name does. When that cuts it off, hovering it shows the
 * whole note; when it fits, there is nothing more to show. Below sm the row
 * has no room for it, and tapping the row opens the panel with the note. */
function RowNote({ note }: { note: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <Tooltip open={open} onOpenChange={(next) => setOpen(next && isTruncated(ref.current))}>
      <TooltipTrigger
        delay={300}
        render={<span ref={ref} />}
        className="hidden sm:inline min-w-0 truncate shrink-[100] text-muted-foreground before:mr-1.5 before:content-['·']"
      >
        {note}
      </TooltipTrigger>
      <TooltipContent className="whitespace-pre-wrap break-words">{note}</TooltipContent>
    </Tooltip>
  );
}
