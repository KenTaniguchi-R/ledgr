"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import { X, Plus, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AmountDisplay } from "@/components/atoms/amount-display";
import { EntityAvatar } from "@/components/atoms/entity-avatar";
import { EditableText } from "@/components/molecules/editable-text";
import { CategoryPill } from "@/components/molecules/category-pill";
import { TransactionSplitRow } from "@/components/molecules/transaction-split-row";
import { TransactionMetadata } from "@/components/molecules/transaction-metadata";
import {
  fetchTransactionDetail,
  updateTransactionFields,
  deleteSplit,
} from "@/actions/transaction-detail";
import { toggleReviewed } from "@/actions/transactions";
import { centsToDisplay } from "@/lib/money";
import { formatDateShort } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import type { TransactionRow as TxnRow, SplitRow } from "@/queries/transactions";
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
  const [txn, setTxn] = useState<TxnRow | null>(initialData);
  const [splits, setSplits] = useState<(SplitRow & { isDraft?: boolean })[]>([]);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(initialData?.reviewed ?? false);
  const [reviewPending, startReviewTransition] = useTransition();

  const detailLoaded = loadedId === transactionId;

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

  useEffect(() => {
    let cancelled = false;

    fetchTransactionDetail(transactionId).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        onClose();
        return;
      }
      const detail = result.data;
      setTxn(detail);
      setSplits(detail.splits);
      setReviewed(detail.reviewed);
      setLoadedId(transactionId);
    });

    return () => { cancelled = true; };
  }, [transactionId, onClose]);

  const handleFieldSave = useCallback(
    async (field: string, value: string) => {
      const result = await updateTransactionFields(transactionId, { [field]: value });
      if ("success" in result && txn) {
        const updated = { ...txn, [field]: value };
        setTxn(updated);
        onTransactionUpdated(updated);
      }
      return result;
    },
    [transactionId, txn, onTransactionUpdated],
  );

  const handleReviewedToggle = useCallback(() => {
    const prev = reviewed;
    setReviewed(!prev);
    startReviewTransition(async () => {
      const result = await toggleReviewed(transactionId);
      if ("error" in result) setReviewed(prev);
      else if (txn) onTransactionUpdated({ ...txn, reviewed: result.reviewed });
    });
  }, [reviewed, transactionId, txn, onTransactionUpdated]);

  const handleAddSplit = useCallback(() => {
    setSplits((prev) => [
      ...prev,
      {
        id: `draft-${Date.now()}`,
        categoryId: "",
        categoryName: null,
        categoryIcon: null,
        amount: 0,
        notes: null,
        isDraft: true,
      },
    ]);
  }, []);

  const handleSplitUpdate = useCallback((updated: SplitRow) => {
    setSplits((prev) =>
      prev.map((s) =>
        s.id === updated.id || (s.isDraft && s.id.startsWith("draft-"))
          ? { ...updated, isDraft: false }
          : s,
      ),
    );
  }, []);

  const handleSplitDelete = useCallback(
    async (splitId: string) => {
      const prev = splits;
      setSplits((s) => s.filter((r) => r.id !== splitId));

      if (!splitId.startsWith("draft-")) {
        const result = await deleteSplit(splitId, transactionId);
        if ("error" in result) setSplits(prev);
      }
    },
    [splits, transactionId],
  );

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

  const hasDraftSplits = splits.some((s) => s.isDraft && !s.categoryId);
  const totalSplitAmount = splits.reduce((sum, s) => sum + s.amount, 0);
  const remaining = Math.abs(txn.normalizedAmount) - totalSplitAmount;
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
        {/* Identity Section */}
        <div className="flex items-start gap-3">
          <EntityAvatar
            logoUrl={txn.merchantLogoUrl}
            name={txn.merchantName ?? txn.name}
            pfcPrimary={txn.pfcPrimary}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <EditableText
              value={txn.name}
              onSave={(v) => handleFieldSave("name", v)}
              className="font-semibold"
            />
            <p className="text-xs text-muted-foreground mt-0.5">{txn.accountName}</p>
            <div className="flex items-center gap-2 mt-1">
              {isPlaidSynced ? (
                <span className="text-xs text-muted-foreground" title="Date is managed by your bank">
                  {formatDateShort(txn.date)}
                </span>
              ) : (
                <EditableText
                  value={txn.date}
                  onSave={(v) => handleFieldSave("date", v)}
                  className="text-xs text-muted-foreground"
                  inputClassName="w-28"
                />
              )}
              {txn.pending && (
                <Badge variant="outline" className="text-[10px] h-5 gap-1">
                  <Clock className="size-3" /> Pending
                </Badge>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* Amount Section */}
        <div className="text-center py-2">
          <div className="text-2xl font-semibold tabular-nums">
            <AmountDisplay amount={txn.normalizedAmount} currency={txn.currency} />
          </div>
        </div>

        <Separator />

        {/* Category Section */}
        {splits.length === 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Category</p>
            <CategoryPill
              transactionId={txn.id}
              currentCategoryId={txn.categoryId}
              currentCategoryName={txn.categoryName}
              categories={categories}
            />
          </div>
        )}

        {/* Splits Section */}
        <div>
          {splits.length > 0 && (
            <div className="bg-muted/30 rounded-lg p-3 space-y-1">
              <p className="text-xs text-muted-foreground mb-1">Splits</p>
              {splits.map((split) => (
                <TransactionSplitRow
                  key={split.id}
                  transactionId={txn.id}
                  split={split}
                  categories={categories}
                  onUpdate={handleSplitUpdate}
                  onDelete={handleSplitDelete}
                />
              ))}
              <div className={cn(
                "flex justify-between text-xs pt-1 border-t border-border/50 mt-1",
                remaining === 0 ? "text-emerald-600" : "text-destructive",
              )}>
                <span>Remaining</span>
                <span className="tabular-nums">{centsToDisplay(remaining)}</span>
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-xs"
            onClick={handleAddSplit}
            disabled={hasDraftSplits}
          >
            <Plus className="size-3 mr-1" /> Add Split
          </Button>
        </div>

        <Separator />

        {/* Notes Section */}
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

        {/* Reviewed Toggle */}
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

        {/* Metadata Section */}
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
