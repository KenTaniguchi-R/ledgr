"use client";

import { memo, useCallback } from "react";
import { Clock } from "lucide-react";
import { AmountDisplay } from "@/components/atoms/amount-display";
import { EntityAvatar } from "@/components/atoms/entity-avatar";
import { CategoryPill } from "@/components/molecules/category-pill";
import { ReviewedDot } from "@/components/atoms/reviewed-dot";
import type { TransactionRow as TxnRow } from "@/queries/transactions";
import type { CategoryGroup } from "@/queries/categories";
import { cn } from "@/lib/utils";

export const TRANSACTION_GRID_COLS =
  "grid-cols-[24px_32px_1fr_auto_100px]" as const;

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
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      onSelect(txn.id, e.target.checked);
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
        `group/row grid ${TRANSACTION_GRID_COLS} items-center h-9 px-2 border-b text-sm hover:bg-muted/50 transition-colors cursor-pointer`,
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

      <div className="flex items-center justify-center" onClick={handleCheckboxClick}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={handleCheckboxChange}
          className="h-3.5 w-3.5 rounded border-muted-foreground/30"
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
          <span className="hidden sm:inline text-[10px] text-muted-foreground shrink-0 max-w-[100px] truncate">
            {txn.accountName}
          </span>
        </div>
      </div>

      <div onClick={handleCheckboxClick}>
        <CategoryPill
          key={`${txn.id}-cat-${txn.categoryId}`}
          transactionId={txn.id}
          currentCategoryId={txn.categoryId}
          currentCategoryName={txn.categoryName}
          categories={categories}
          disabled={txn.hasSplits}
        />
      </div>

      <div className="text-right">
        <AmountDisplay amount={txn.normalizedAmount} currency={txn.currency} pending={txn.pending} />
      </div>
    </div>
  );
});
