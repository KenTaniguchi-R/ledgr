"use client";

import { useState, useCallback } from "react";
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

  const start = useCallback(() => {
    const q = rows.filter((r) => !r.reviewed && !r.pending);
    setQueue(q);
    setCurrentIndex(0);
    setSessionReviewedCount(0);
    setDirection("forward");
    if (q.length === 0) {
      setPhase("COMPLETE");
    } else {
      setPhase("VIEWING");
    }
  }, [rows]);

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
  };
}
