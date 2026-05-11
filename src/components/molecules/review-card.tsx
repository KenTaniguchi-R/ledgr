"use client";

import { useRef, useEffect } from "react";
import { EntityAvatar } from "@/components/atoms/entity-avatar";
import { AmountDisplay } from "@/components/atoms/amount-display";
import { CategoryPill } from "@/components/molecules/category-pill";
import { EditableText } from "@/components/molecules/editable-text";
import { formatDateShort } from "@/lib/date-utils";
import type { TransactionRow } from "@/queries/transactions";
import type { CategoryGroup } from "@/queries/categories";

interface ReviewCardProps {
  transaction: TransactionRow;
  categories: CategoryGroup[];
  direction: "forward" | "back";
  categoryOpen: boolean;
  onCategoryOpenChange: (open: boolean) => void;
  onCategoryChange: (categoryId: string | null, categoryName: string | null) => void;
  onNotesSave: (value: string) => Promise<{ success: true } | { error: string }>;
}

export function ReviewCard({
  transaction,
  categories,
  direction,
  categoryOpen,
  onCategoryOpenChange,
  onCategoryChange,
  onNotesSave,
}: ReviewCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cardRef.current?.focus();
  }, [transaction.id]);

  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      className="outline-none space-y-4"
      data-direction={direction}
      key={transaction.id}
      style={{
        animation: `slide-in-${direction === "forward" ? "right" : "left"} 150ms ease-out`,
      }}
    >
      <div className="flex items-center gap-3">
        <EntityAvatar
          logoUrl={transaction.merchantLogoUrl}
          name={transaction.merchantName ?? transaction.name}
          pfcPrimary={transaction.pfcPrimary}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">{transaction.name}</p>
          <p className="text-xs text-muted-foreground">
            {transaction.accountName} &middot; {formatDateShort(transaction.date)}
          </p>
        </div>
      </div>

      <div className="text-center py-2">
        <div className="text-3xl font-semibold tabular-nums">
          <AmountDisplay amount={transaction.normalizedAmount} currency={transaction.currency} />
        </div>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Category</p>
        <CategoryPill
          transactionId={transaction.id}
          currentCategoryId={transaction.categoryId}
          currentCategoryName={transaction.categoryName}
          categories={categories}
          onCategoryChange={onCategoryChange}
          open={categoryOpen}
          onOpenChange={onCategoryOpenChange}
        />
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Notes</p>
        <EditableText
          value={transaction.notes ?? ""}
          onSave={onNotesSave}
          placeholder="Add notes..."
          className="text-sm"
        />
      </div>
    </div>
  );
}
