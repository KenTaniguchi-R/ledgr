"use client";

import { useCallback, useRef, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ReviewCard } from "@/components/molecules/review-card";
import { ReviewProgressBar } from "@/components/atoms/review-progress-bar";
import { ReviewKeyHints } from "@/components/atoms/review-key-hints";
import { useReviewQueue } from "@/hooks/use-review-queue";
import { useReviewKeyboard } from "@/hooks/use-review-keyboard";
import { toggleReviewed } from "@/actions/transactions";
import { updateTransactionFields } from "@/actions/transaction-detail";
import type { TransactionRow } from "@/queries/transactions";
import type { CategoryGroup } from "@/queries/categories";

interface ReviewCardDialogProps {
  rows: TransactionRow[];
  categories: CategoryGroup[];
  onDone: () => void;
}

export function ReviewCardDialog({
  rows,
  categories,
  onDone,
}: ReviewCardDialogProps) {
  const router = useRouter();

  const handleConfirmAction = useCallback(async (transactionId: string) => {
    await toggleReviewed(transactionId);
  }, []);

  const {
    phase,
    setPhase,
    currentIndex,
    currentTransaction,
    queueLength,
    sessionReviewedCount,
    direction,
    start,
    confirm,
    skip,
    retreat,
    exit,
  } = useReviewQueue(rows, handleConfirmAction);

  useEffect(() => {
    start();
  }, [start]);

  const handleExit = useCallback(() => {
    exit();
    router.refresh();
    onDone();
  }, [exit, router, onDone]);

  const handlers = useMemo(() => ({
    onConfirm: confirm,
    onSkip: skip,
    onRetreat: retreat,
    onEditCategory: () => setPhase("EDITING_CATEGORY"),
    onEditNotes: () => {
      setPhase("EDITING_NOTES");
    },
    onExit: handleExit,
  }), [confirm, skip, retreat, setPhase, handleExit]);

  useReviewKeyboard(phase, handlers, phase === "VIEWING");

  const handleCategoryChange = useCallback(
    (_categoryId: string | null, _categoryName: string | null) => {
      setPhase("VIEWING");
    },
    [setPhase],
  );

  const handleCategoryOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setPhase("EDITING_CATEGORY");
      } else {
        setPhase("VIEWING");
      }
    },
    [setPhase],
  );

  const handleNotesSave = useCallback(
    async (value: string) => {
      if (!currentTransaction) return { error: "No transaction" };
      const result = await updateTransactionFields(currentTransaction.id, { notes: value });
      setPhase("VIEWING");
      return result;
    },
    [currentTransaction, setPhase],
  );

  const isOpen = phase !== "IDLE";

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => { if (!open) handleExit(); }}
    >
      <DialogContent
        className="sm:max-w-lg"
        aria-label="Transaction review"
      >
        <DialogTitle className="sr-only">Transaction Review</DialogTitle>

        {phase === "COMPLETE" ? (
          <div className="text-center py-8 space-y-4">
            <p className="text-lg font-semibold">Review complete</p>
            <p className="text-sm text-muted-foreground">
              {sessionReviewedCount} transaction{sessionReviewedCount !== 1 ? "s" : ""} reviewed
            </p>
            <Button onClick={handleExit}>Done</Button>
          </div>
        ) : currentTransaction ? (
          <div className="space-y-4">
            <ReviewProgressBar
              current={sessionReviewedCount}
              total={queueLength}
            />

            <ReviewCard
              transaction={currentTransaction}
              categories={categories}
              direction={direction}
              categoryOpen={phase === "EDITING_CATEGORY"}
              onCategoryOpenChange={handleCategoryOpenChange}
              onCategoryChange={handleCategoryChange}
              onNotesSave={handleNotesSave}
            />

            <div className="flex items-center justify-between pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={retreat}
                disabled={currentIndex === 0}
              >
                Back
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={skip}>
                  Skip
                </Button>
                <Button size="sm" onClick={confirm}>
                  Confirm
                </Button>
              </div>
            </div>

            {phase === "VIEWING" && <ReviewKeyHints />}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
