"use client";

import { accountDisplayName } from "@/lib/account-name";
import { memo, useCallback } from "react";
import { Clock } from "lucide-react";
import { AmountDisplay } from "@/components/atoms/amount-display";
import { EntityAvatar } from "@/components/molecules/entity-avatar";
import { CategoryPill } from "@/components/molecules/category-pill";
import { ReviewedDot } from "@/components/molecules/reviewed-dot";
import { Checkbox } from "@/components/ui/checkbox";
import type { TransactionRow as TxnRow } from "@/queries/transactions";
import type { CategoryGroup } from "@/queries/categories";
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

interface TransactionRowProps {
  transaction: TxnRow;
  categories: CategoryGroup[];
  isSelected: boolean;
  isActive?: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onClick?: () => void;
}

export const TransactionRow = memo(function TransactionRow({
  transaction: txn,
  categories,
  isSelected,
  isActive = false,
  onSelect,
  onClick,
}: TransactionRowProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick?.();
      }
    },
    [onClick],
  );

  const handleCheckboxChange = useCallback(
    (checked: boolean) => {
      onSelect(txn.id, checked);
    },
    [txn.id, onSelect],
  );

  const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "group/row grid items-center h-11 sm:h-9 px-2 border-b border-border/50 text-sm hover:bg-muted/30 transition-colors cursor-pointer",
        TRANSACTION_GRID_COLS,
        txn.pending && "opacity-60",
        isActive && "bg-muted",
      )}
    >
      <div onClick={handleCheckboxClick}>
        <ReviewedDot
          key={`${txn.id}-reviewed-${txn.reviewed}`}
          transactionId={txn.id}
          reviewed={txn.reviewed}
        />
      </div>

      <div className="hidden sm:flex items-center justify-center" onClick={handleCheckboxClick}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={handleCheckboxChange}
        />
      </div>

      <div className="flex items-center gap-1.5 pr-2 min-w-0">
        <EntityAvatar
          logoUrl={txn.merchantLogoUrl}
          name={txn.merchantName ?? txn.name}
          pfcPrimary={txn.pfcPrimary}
          size="sm"
        />
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          {txn.pending && <Clock className="size-3 text-muted-foreground shrink-0" />}
          <span className="font-medium truncate">{txn.name}</span>
          {txn.originalName !== txn.name && (
            <span className="text-xs text-muted-foreground hidden group-hover/row:inline truncate">
              ({txn.originalName})
            </span>
          )}
          <span className="hidden sm:inline lg:hidden text-[10px] text-muted-foreground shrink-0 max-w-[100px] truncate">
            {txn.accountName && accountDisplayName(txn.accountName)}
          </span>
        </div>
      </div>

      <div className="hidden min-w-0 pr-2 text-xs text-muted-foreground lg:block">
        <span className="block truncate">
          {txn.accountName && accountDisplayName(txn.accountName)}
        </span>
      </div>

      <div className="min-w-0" onClick={handleCheckboxClick}>
        <CategoryPill
          key={`${txn.id}-cat-${txn.categoryId}`}
          transactionId={txn.id}
          currentCategoryId={txn.categoryId}
          currentCategoryName={txn.categoryName}
          categories={categories}
          disabled={txn.hasSplits}
          isTransfer={txn.isTransfer}
          merchantId={txn.merchantId}
          merchantName={txn.merchantName}
        />
      </div>

      <div className="text-right">
        <AmountDisplay amount={txn.normalizedAmount} currency={txn.currency} pending={txn.pending} />
      </div>
    </div>
  );
});
