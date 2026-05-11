"use client";

import { useState, useRef, useCallback } from "react";
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
  const queueRef = useRef<TransactionRow[]>([]);
  const directionRef = useRef<"forward" | "back">("forward");

  const queueLength = queueRef.current.length;
  const currentTransaction = phase !== "IDLE" && phase !== "COMPLETE"
    ? queueRef.current[currentIndex] ?? null
    : null;

  const start = useCallback(() => {
    const queue = rows.filter((r) => !r.reviewed && !r.pending);
    queueRef.current = queue;
    setCurrentIndex(0);
    setSessionReviewedCount(0);
    directionRef.current = "forward";
    if (queue.length === 0) {
      setPhase("COMPLETE");
    } else {
      setPhase("VIEWING");
    }
  }, [rows]);

  const confirm = useCallback(() => {
    const txn = queueRef.current[currentIndex];
    if (txn) onConfirm?.(txn.id);
    setSessionReviewedCount((c) => c + 1);
    directionRef.current = "forward";
    if (currentIndex + 1 >= queueRef.current.length) {
      setPhase("COMPLETE");
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }, [currentIndex, onConfirm]);

  const skip = useCallback(() => {
    directionRef.current = "forward";
    if (currentIndex + 1 >= queueRef.current.length) {
      setPhase("COMPLETE");
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }, [currentIndex]);

  const retreat = useCallback(() => {
    if (currentIndex > 0) {
      directionRef.current = "back";
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
    direction: directionRef.current,
    start,
    confirm,
    skip,
    retreat,
    exit,
  };
}
