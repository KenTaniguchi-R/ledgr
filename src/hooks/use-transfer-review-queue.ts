"use client";

import { useState, useCallback } from "react";
import type { TransactionRow } from "@/queries/transactions";

export type TransferReviewPhase = "IDLE" | "VIEWING" | "SAVING" | "COMPLETE";
export type TransferDecision = "transfer" | "spending";

export function useTransferReviewQueue(
  rows: TransactionRow[],
  onDecide?: (transactionId: string, decision: TransferDecision) => void | Promise<void>,
) {
  const [phase, setPhase] = useState<TransferReviewPhase>("IDLE");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionResolvedCount, setSessionResolvedCount] = useState(0);
  const [queue, setQueue] = useState<TransactionRow[]>([]);
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  const queueLength = queue.length;
  const currentTransaction = phase !== "IDLE" && phase !== "COMPLETE"
    ? queue[currentIndex] ?? null
    : null;

  const start = useCallback(() => {
    setQueue(rows);
    setCurrentIndex(0);
    setSessionResolvedCount(0);
    setDirection("forward");
    setPhase(rows.length === 0 ? "COMPLETE" : "VIEWING");
  }, [rows]);

  const decide = useCallback(async (decision: TransferDecision) => {
    const txn = queue[currentIndex];
    if (!txn) return;

    setPhase("SAVING");
    try {
      await onDecide?.(txn.id, decision);
      setSessionResolvedCount((c) => c + 1);
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
  }, [currentIndex, queue, onDecide]);

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
    currentIndex,
    currentTransaction,
    queueLength,
    sessionResolvedCount,
    direction,
    start,
    decide,
    retreat,
    exit,
  };
}
