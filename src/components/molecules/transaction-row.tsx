// src/components/molecules/transaction-row.tsx
"use client";

import { Clock } from "lucide-react";
import { AmountDisplay } from "@/components/atoms/amount-display";
import { EntityAvatar } from "@/components/atoms/entity-avatar";
import { CategoryPill } from "@/components/molecules/category-pill";
import { ReviewedDot } from "@/components/molecules/reviewed-dot";
import { Badge } from "@/components/ui/badge";
import type { TransactionRow as TxnRow } from "@/queries/transactions";
import type { CategoryGroup } from "@/queries/categories";
import { cn } from "@/lib/utils";

export const TRANSACTION_GRID_COLS =
  "grid-cols-[24px_32px_1fr_auto_100px]" as const;

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
        `group/row grid ${TRANSACTION_GRID_COLS} items-center h-9 px-2 border-b text-sm hover:bg-muted/50 transition-colors`,
        txn.pending && "opacity-60",
      )}
    >
      <ReviewedDot
        key={`${txn.id}-reviewed-${txn.reviewed}`}
        transactionId={txn.id}
        reviewed={txn.reviewed}
      />

      <div className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelect(txn.id, e.target.checked)}
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
        <div className="flex items-center gap-1.5 min-w-0">
          {txn.pending && <Clock className="size-3 text-muted-foreground shrink-0" />}
          <span className="font-medium truncate">{txn.name}</span>
          {txn.originalName !== txn.name && (
            <span className="text-xs text-muted-foreground hidden group-hover/row:inline truncate">
              ({txn.originalName})
            </span>
          )}
          <Badge variant="secondary" className="text-[10px] px-1.5 h-4 hidden sm:inline-flex shrink-0 max-w-[100px] truncate">
            {txn.accountName}
          </Badge>
        </div>
      </div>

      <CategoryPill
        key={`${txn.id}-cat-${txn.categoryId}`}
        transactionId={txn.id}
        currentCategoryId={txn.categoryId}
        currentCategoryName={txn.categoryName}
        categories={categories}
        disabled={txn.hasSplits}
      />

      <div className="text-right">
        <AmountDisplay amount={txn.normalizedAmount} currency={txn.currency} pending={txn.pending} />
      </div>
    </div>
  );
}
