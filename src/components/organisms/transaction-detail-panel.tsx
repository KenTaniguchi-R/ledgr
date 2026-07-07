"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AmountDisplay } from "@/components/atoms/amount-display";
import { EditableText } from "@/components/molecules/editable-text";
import { CategoryPill } from "@/components/molecules/category-pill";
import { TransactionIdentityHeader } from "@/components/molecules/transaction-identity-header";
import { SplitEditor } from "@/components/molecules/split-editor";
import { TransactionMetadata } from "@/components/molecules/transaction-metadata";
import { useTransactionDetail } from "@/hooks/use-transaction-detail";
import type { TransactionRow as TxnRow } from "@/queries/transactions";
import type { CategoryGroup } from "@/queries/categories";

interface TransactionDetailPanelProps {
  transactionId: string;
  initialData: TxnRow | null;
  categories: CategoryGroup[];
  onClose: () => void;
  onTransactionUpdated: (updated: TxnRow) => void;
  onSelectTransaction: (id: string) => void;
}

export function TransactionDetailPanel({
  transactionId,
  initialData,
  categories,
  onClose,
  onTransactionUpdated,
  onSelectTransaction,
}: TransactionDetailPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  const {
    txn,
    splits,
    reviewed,
    reviewPending,
    detailLoaded,
    handleFieldSave,
    handleReviewedToggle,
    handleAddSplit,
    handleSplitUpdate,
    handleSplitDelete,
  } = useTransactionDetail(transactionId, initialData, onClose, onTransactionUpdated);

  useEffect(() => {
    headingRef.current?.focus();
  }, [transactionId]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  if (!txn) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  const isPlaidSynced = Boolean(txn.plaidTransactionId);

  return (
    <div
      role="complementary"
      aria-label="Transaction details"
      className="h-full overflow-y-auto"
    >
      <div className="sticky top-0 bg-background z-10 flex items-center justify-between px-4 py-3 border-b">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-sm font-semibold text-muted-foreground outline-none"
        >
          Transaction Details
        </h2>
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="p-4 space-y-4">
        <TransactionIdentityHeader
          name={txn.name}
          originalName={txn.originalName}
          accountName={txn.accountName}
          date={txn.date}
          pending={txn.pending}
          merchantLogoUrl={txn.merchantLogoUrl}
          merchantName={txn.merchantName}
          pfcPrimary={txn.pfcPrimary}
          isPlaidSynced={isPlaidSynced}
          onNameSave={(v) => handleFieldSave("name", v)}
          onDateSave={(v) => handleFieldSave("date", v)}
        />

        <Separator />

        <div className="text-center py-2">
          <div className="text-2xl font-semibold tabular-nums">
            <AmountDisplay amount={txn.normalizedAmount} currency={txn.currency} />
          </div>
        </div>

        <Separator />

        {splits.length === 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Category</p>
            <CategoryPill
              transactionId={txn.id}
              currentCategoryId={txn.categoryId}
              currentCategoryName={txn.categoryName}
              categories={categories}
              isTransfer={txn.isTransfer}
            />
          </div>
        )}

        <SplitEditor
          transactionId={txn.id}
          splits={splits}
          totalAmount={txn.normalizedAmount}
          categories={categories}
          onAdd={handleAddSplit}
          onUpdate={handleSplitUpdate}
          onDelete={handleSplitDelete}
        />

        <Separator />

        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Notes</p>
          <EditableText
            value={txn.notes ?? ""}
            onSave={(v) => handleFieldSave("notes", v)}
            placeholder="Add notes..."
            className="text-sm"
          />
        </div>

        <Separator />

        <div className="flex items-center gap-2">
          <Switch
            id="reviewed"
            checked={reviewed}
            onCheckedChange={handleReviewedToggle}
            disabled={reviewPending}
          />
          <Label htmlFor="reviewed" className="text-sm cursor-pointer">
            Mark as Reviewed
          </Label>
        </div>

        {detailLoaded && <Separator />}
        {detailLoaded && (
          <TransactionMetadata
            originalName={txn.originalName}
            categorySource={txn.categorySource ?? null}
            plaidTransactionId={txn.plaidTransactionId ?? null}
            transferPairId={txn.transferPairId ?? null}
            onSelectTransferPair={onSelectTransaction}
          />
        )}
      </div>
    </div>
  );
}
