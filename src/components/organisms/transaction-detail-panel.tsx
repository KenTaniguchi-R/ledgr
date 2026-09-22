"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, Clock, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { AmountDisplay } from "@/components/atoms/amount-display";
import { EntityAvatar } from "@/components/molecules/entity-avatar";
import { EditableText } from "@/components/molecules/editable-text";
import { Textarea } from "@/components/ui/textarea";
import { CategoryPill } from "@/components/molecules/category-pill";
import { DetailGroup, DetailRow } from "@/components/molecules/detail-group";
import { SplitEditor } from "@/components/molecules/split-editor";
import { useTransactionDetail } from "@/hooks/use-transaction-detail";
import { centsToDisplay } from "@/lib/money";
import { formatDateShort } from "@/lib/date-utils";
import type { TransactionRow as TxnRow } from "@/queries/transactions";
import type { CategoryGroup } from "@/queries/categories";

const SOURCE_LABELS: Record<string, string> = {
  manual: "You",
  ai: "AI",
  ai_low_confidence: "AI — low confidence",
  rule: "A rule",
  merchant_default: "This merchant's default",
  plaid: "Plaid",
  pfc: "Plaid's category",
};

interface TransactionDetailPanelProps {
  transactionId: string;
  initialData: TxnRow | null;
  categories: CategoryGroup[];
  onClose: () => void;
  onTransactionUpdated: (updated: TxnRow) => void;
  onSelectTransaction: (id: string) => void;
  /** Previous/next row in the ledger, or null at either end. */
  onStepPrev?: (() => void) | null;
  onStepNext?: (() => void) | null;
}

export function TransactionDetailPanel({
  transactionId,
  initialData,
  categories,
  onClose,
  onTransactionUpdated,
  onSelectTransaction,
  onStepPrev = null,
  onStepNext = null,
}: TransactionDetailPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [splitsOpen, setSplitsOpen] = useState(false);

  const {
    txn,
    splits,
    reviewed,
    reviewPending,
    transferPending,
    hiddenPending,
    detailLoaded,
    handleFieldSave,
    handleCategorySave,
    handleReviewedToggle,
    handleTransferToggle,
    handleHiddenToggle,
    handleAddSplit,
    handleSplitUpdate,
    handleSplitDelete,
  } = useTransactionDetail(transactionId, initialData, onClose, onTransactionUpdated);

  // Stepping to another transaction collapses the split editor again. Adjusted
  // during render rather than in an effect, so the panel never paints one
  // transaction's open editor over the next one's splits.
  const [splitsOpenFor, setSplitsOpenFor] = useState(transactionId);
  if (splitsOpenFor !== transactionId) {
    setSplitsOpenFor(transactionId);
    setSplitsOpen(false);
  }

  // The note card is always-open (not click-to-edit like the other fields),
  // so its draft is kept in local state and resynced whenever the selected
  // transaction changes, the same way splitsOpen is reset above.
  const [noteDraft, setNoteDraft] = useState(txn?.notes ?? "");
  const [noteDraftFor, setNoteDraftFor] = useState(transactionId);
  if (noteDraftFor !== transactionId) {
    setNoteDraftFor(transactionId);
    setNoteDraft(txn?.notes ?? "");
  }
  const [isNotePending, startNoteTransition] = useTransition();

  const handleNoteBlur = () => {
    if (!txn || noteDraft === (txn.notes ?? "")) return;
    startNoteTransition(async () => {
      const result = await handleFieldSave("notes", noteDraft);
      if ("error" in result) setNoteDraft(txn.notes ?? "");
    });
  };

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [transactionId]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      // Arrow keys belong to whatever the user is actually typing in or
      // choosing from — the category popover's own list, above all.
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable], [role="listbox"], [role="menu"]')) {
        return;
      }
      const step = e.key === "ArrowUp" ? onStepPrev : onStepNext;
      if (!step) return;
      e.preventDefault();
      step();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, onStepPrev, onStepNext]);

  if (!txn) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="mx-auto h-10 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  const isBankSynced = Boolean(txn.externalId);
  const splitSummary =
    splits.length > 0
      ? `${centsToDisplay(Math.abs(txn.normalizedAmount), txn.currency)} split ${splits.length} ways`
      : "Not split";

  return (
    <div
      role="complementary"
      aria-label="Transaction details"
      className="flex max-h-full flex-col"
    >
      <div className="flex shrink-0 items-center gap-1 p-2 pl-1.5">
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label="Close details">
          <ChevronLeft className="size-4" />
        </Button>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="min-w-0 flex-1 truncate px-1 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground outline-none"
        >
          {txn.name}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => onStepPrev?.()}
          disabled={!onStepPrev}
          aria-label="Previous transaction"
        >
          <ArrowUp className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => onStepNext?.()}
          disabled={!onStepNext}
          aria-label="Next transaction"
        >
          <ArrowDown className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {/* The amount and its category are what the panel is opened for, so they
            lead. Everything else is a row in a group below. */}
        <div className="py-4 pb-6 text-center">
          <AmountDisplay
            amount={txn.normalizedAmount}
            currency={txn.currency}
            className="text-[38px] font-semibold leading-none tracking-tight"
          />
          <div className="mt-3.5 flex items-center justify-center gap-2">
            <CategoryPill
              transactionId={txn.id}
              currentCategoryId={txn.categoryId}
              currentCategoryName={txn.categoryName}
              categories={categories}
              disabled={splits.length > 0}
              isTransfer={txn.isTransfer}
              transferSource={txn.transferSource}
              merchantId={txn.merchantId}
              merchantName={txn.merchantName}
              onSaved={handleCategorySave}
            />
            {txn.pending && (
              <Badge variant="outline" className="h-5 gap-1 text-[10px]">
                <Clock className="size-3" /> Pending
              </Badge>
            )}
          </div>
        </div>

        <DetailGroup>
          <DetailRow label="Date">
            {isBankSynced ? (
              <span className="text-muted-foreground" title="Your bank owns the date on synced transactions">
                {formatDateShort(txn.date)}
              </span>
            ) : (
              <EditableText
                value={txn.date}
                onSave={(v) => handleFieldSave("date", v)}
                inputClassName="w-32"
              />
            )}
          </DetailRow>

          {txn.merchantName && (
            <DetailRow label="Merchant">
              <span className="truncate">{txn.merchantName}</span>
            </DetailRow>
          )}

          <DetailRow
            label="Paired with"
            onClick={txn.transferPairId ? () => onSelectTransaction(txn.transferPairId!) : undefined}
          >
            {txn.transferPairId ? (
              <span className="truncate">View the other leg</span>
            ) : (
              <span className="text-muted-foreground">None</span>
            )}
          </DetailRow>

          {/* `isTransfer` drops the row from budgets, reports and spending
              totals; it does not hide it. The label says what it does. */}
          <DetailRow label="Exclude from spend">
            <Switch
              checked={txn.isTransfer}
              onCheckedChange={handleTransferToggle}
              disabled={transferPending}
              aria-label="Exclude from spend"
            />
          </DetailRow>

          <DetailRow label="Hide transaction" hint="Removed from the list until shown again">
            <Switch
              checked={txn.isHidden}
              onCheckedChange={handleHiddenToggle}
              disabled={hiddenPending}
              aria-label="Hide transaction"
            />
          </DetailRow>

          <DetailRow
            label="Split transaction"
            hint={splitSummary}
            onClick={() => setSplitsOpen((v) => !v)}
          />
        </DetailGroup>

        {(splitsOpen || splits.length > 0) && (
          <div className="mt-3">
            <SplitEditor
              transactionId={txn.id}
              splits={splits}
              totalAmount={txn.normalizedAmount}
              categories={categories}
              onAdd={handleAddSplit}
              onUpdate={handleSplitUpdate}
              onDelete={handleSplitDelete}
            />
          </div>
        )}

        {/* Its own card, always open — a note is the one field here someone
            might actually write a sentence into, not a settings toggle. */}
        <div className="mt-3.5 rounded-xl bg-card px-3.5 py-3 ring-1 ring-foreground/10">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
            <StickyNote className="size-3" aria-hidden />
            Note
          </div>
          <Textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={handleNoteBlur}
            disabled={isNotePending}
            placeholder="Add a note…"
            rows={2}
            className="min-h-12 resize-none border-none bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 md:text-sm"
          />
        </div>

        <DetailGroup className="mt-3.5">
          <DetailRow label="Review status">
            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded-full text-xs"
              onClick={handleReviewedToggle}
              disabled={reviewPending}
            >
              {reviewed ? "Mark as unreviewed" : "Mark as reviewed"}
            </Button>
          </DetailRow>

          {detailLoaded && txn.categorySource && (
            <DetailRow label="Categorised by">
              <span className="text-muted-foreground">
                {SOURCE_LABELS[txn.categorySource] ?? txn.categorySource}
              </span>
            </DetailRow>
          )}
        </DetailGroup>

        {/* The account and the bank's own wording, quiet at the bottom — where
            Origin puts them — rather than two clicks into a disclosure. */}
        <div className="flex flex-col items-center gap-1.5 px-2 pt-7 text-center">
          <span className="flex items-center gap-2 text-xs">
            <EntityAvatar
              logoUrl={txn.merchantLogoUrl}
              name={txn.merchantName ?? txn.name}
              pfcPrimary={txn.pfcPrimary}
              size="sm"
            />
            {txn.accountName}
          </span>
          {txn.originalName !== txn.name && (
            <span className="font-mono text-[11px] break-all text-muted-foreground">
              {txn.originalName}
            </span>
          )}
          {(onStepPrev || onStepNext) && (
            <span className="mt-2 text-[11px] text-muted-foreground">
              ↑↓ to move · esc to close
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
