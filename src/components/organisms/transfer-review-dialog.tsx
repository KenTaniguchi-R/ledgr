"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TransferReviewCard } from "@/components/molecules/transfer-review-card";
import { ReviewProgressBar } from "@/components/atoms/review-progress-bar";
import { useTransferReviewQueue, type TransferDecision } from "@/hooks/use-transfer-review-queue";
import { confirmTransferSuggestion, rejectTransferSuggestion } from "@/actions/transaction-detail";
import type { TransactionRow } from "@/queries/transactions";

interface TransferReviewDialogProps {
  rows: TransactionRow[];
  onDone: () => void;
}

export function TransferReviewDialog({ rows, onDone }: TransferReviewDialogProps) {
  const router = useRouter();

  const handleDecide = useCallback(async (transactionId: string, decision: TransferDecision) => {
    if (decision === "transfer") {
      await confirmTransferSuggestion(transactionId);
    } else {
      await rejectTransferSuggestion(transactionId);
    }
  }, []);

  const {
    phase,
    currentIndex,
    currentTransaction,
    queueLength,
    sessionResolvedCount,
    direction,
    start,
    decide,
    retreat,
    exit,
  } = useTransferReviewQueue(rows, handleDecide);

  useEffect(() => {
    start();
  }, [start]);

  const handleExit = useCallback(() => {
    exit();
    router.refresh();
    onDone();
  }, [exit, router, onDone]);

  const isSaving = phase === "SAVING";
  const isOpen = phase !== "IDLE";
  const keepLabel = currentTransaction && currentTransaction.normalizedAmount > 0 ? "Keep as income" : "Keep as spending";

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => { if (!open) handleExit(); }}
    >
      <DialogContent
        className="sm:max-w-lg"
        aria-label="Transfer review"
      >
        <DialogTitle className="sr-only">Transfer Review</DialogTitle>

        {phase === "COMPLETE" ? (
          <div className="text-center py-8 space-y-4">
            <p className="text-lg font-semibold">All caught up</p>
            <p className="text-sm text-muted-foreground">
              {sessionResolvedCount} transaction{sessionResolvedCount !== 1 ? "s" : ""} resolved
            </p>
            <Button onClick={handleExit}>Done</Button>
          </div>
        ) : currentTransaction ? (
          <div className="space-y-4">
            <ReviewProgressBar
              current={sessionResolvedCount}
              total={queueLength}
            />

            <TransferReviewCard
              transaction={currentTransaction}
              direction={direction}
            />

            <div className="flex items-center justify-between pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={retreat}
                disabled={currentIndex === 0 || isSaving}
              >
                Back
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => decide("spending")} disabled={isSaving}>
                  {keepLabel}
                </Button>
                <Button size="sm" onClick={() => decide("transfer")} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Mark as transfer"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
