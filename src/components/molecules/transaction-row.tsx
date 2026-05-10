"use client";

import { AmountDisplay } from "@/components/atoms/amount-display";
import { EntityAvatar } from "@/components/atoms/entity-avatar";
import { CategoryPicker } from "@/components/molecules/category-picker";
import { ReviewedCheckbox } from "@/components/molecules/reviewed-checkbox";
import type { TransactionRow as TxnRow } from "@/queries/transactions";
import type { CategoryGroup } from "@/queries/categories";
import { cn } from "@/lib/utils";

export const TRANSACTION_GRID_COLS =
  "grid-cols-[32px_90px_1fr_140px_160px_100px_40px]" as const;

interface TransactionRowProps {
  transaction: TxnRow;
  categories: CategoryGroup[];
  isSelected: boolean;
  onSelect: (id: string, checked: boolean) => void;
}

export function TransactionRow({
  transaction: txn,
  categories,
  isSelected,
  onSelect,
}: TransactionRowProps) {
  return (
    <div
      className={cn(
        `group/row grid ${TRANSACTION_GRID_COLS} items-center h-10 px-2 border-b text-sm hover:bg-muted/50 transition-colors`,
        !txn.reviewed && "border-l-2 border-l-primary/40",
        txn.pending && "opacity-60",
      )}
    >
      <div className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelect(txn.id, e.target.checked)}
          className="h-3.5 w-3.5 rounded border-muted-foreground/30"
        />
      </div>

      <span className="text-muted-foreground text-xs">
        {new Date(txn.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </span>

      <div className="flex items-center gap-1.5 pr-2 min-w-0">
        <EntityAvatar
          logoUrl={txn.merchantLogoUrl}
          name={txn.merchantName ?? txn.name}
          pfcPrimary={txn.pfcPrimary}
          size="sm"
        />
        <div className="truncate">
          <span className="font-medium">{txn.name}</span>
          {txn.originalName !== txn.name && (
            <span className="text-xs text-muted-foreground ml-1 hidden group-hover/row:inline">
              ({txn.originalName})
            </span>
          )}
        </div>
      </div>

      <span className="text-muted-foreground text-xs truncate">{txn.accountName}</span>

      <CategoryPicker
        transactionId={txn.id}
        currentCategoryId={txn.categoryId}
        currentCategoryName={txn.categoryName}
        categories={categories}
        disabled={txn.hasSplits}
      />

      <div className="text-right">
        <AmountDisplay amount={txn.normalizedAmount} currency={txn.currency} pending={txn.pending} />
      </div>

      <div className="flex items-center justify-center">
        <ReviewedCheckbox transactionId={txn.id} reviewed={txn.reviewed} />
      </div>
    </div>
  );
}
