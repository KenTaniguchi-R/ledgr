"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { TransactionRow } from "@/queries/transactions";

export type ReviewPhase =
  | "IDLE"
  | "VIEWING"
  | "EDITING_CATEGORY"
  | "EDITING_NOTES"
  | "SAVING"
  | "COMPLETE";

export function useReviewQueue(
  rows: TransactionRow[],
  onConfirm?: (transactionId: string) => void | Promise<void>,
) {
  const [phase, setPhase] = useState<ReviewPhase>("IDLE");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionReviewedCount, setSessionReviewedCount] = useState(0);
  const [queue, setQueue] = useState<TransactionRow[]>([]);
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  const queueLength = queue.length;
  const currentTransaction = phase !== "IDLE" && phase !== "COMPLETE"
    ? queue[currentIndex] ?? null
    : null;

  // `rows` isn't just an initial snapshot — every persisted edit anywhere in
  // this app (including a category picked mid-review, a few lines down) calls
  // `revalidatePath("/transactions")`, which pushes a fresh `rows` reference
  // down from the list. `start` reads through a ref instead of closing over
  // `rows` directly so it stays referentially stable; otherwise the mount
  // effect below (`useEffect(() => start(), [start])`) re-fires on every such
  // edit and restarts the whole queue from card one.
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  });

  const start = useCallback(() => {
    const q = rowsRef.current.filter((r) => !r.reviewed && !r.pending);
    setQueue(q);
    setCurrentIndex(0);
    setSessionReviewedCount(0);
    setDirection("forward");
    if (q.length === 0) {
      setPhase("COMPLETE");
    } else {
      setPhase("VIEWING");
    }
  }, []);

  const confirm = useCallback(async () => {
    const txn = queue[currentIndex];
    if (!txn) return;

    setPhase("SAVING");
    try {
      await onConfirm?.(txn.id);
      setSessionReviewedCount((c) => c + 1);
      setDirection("forward");
      if (currentIndex + 1 >= queue.length) {
        setPhase("COMPLETE");
      } else {
        setCurrentIndex((i) => i + 1);
        setPhase("VIEWING");
      }
    } catch {
      setPhase("VIEWING");
    }
  }, [currentIndex, queue, onConfirm]);

  const skip = useCallback(() => {
    setDirection("forward");
    if (currentIndex + 1 >= queue.length) {
      setPhase("COMPLETE");
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }, [currentIndex, queue.length]);

  const retreat = useCallback(() => {
    if (currentIndex > 0) {
      setDirection("back");
      setCurrentIndex((i) => i - 1);
    }
  }, [currentIndex]);

  const exit = useCallback(() => {
    setPhase("IDLE");
  }, []);

  // Category/notes edits made mid-review persist themselves (see
  // ReviewCardDialog), but the queue is its own snapshot of `rows` — without
  // this the edit only lives in whatever local state the field itself holds,
  // and going Back to a card, or the card you already edited, shows the
  // pre-edit value again.
  const updateCurrentTransaction = useCallback(
    (patch: Partial<TransactionRow>) => {
      setQueue((prev) =>
        prev.map((t, i) => (i === currentIndex ? { ...t, ...patch } : t)),
      );
    },
    [currentIndex],
  );

  return {
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
    updateCurrentTransaction,
  };
}
