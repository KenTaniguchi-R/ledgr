"use client";

import { useState, useEffect, useCallback, useTransition, useRef } from "react";
import {
  fetchTransactionDetail,
  updateTransactionFields,
} from "@/actions/transaction-detail";
import { toggleReviewed } from "@/actions/transactions";
import type { TransactionRow as TxnRow } from "@/queries/transactions";
import { useSplitEditor } from "./use-split-editor";

export function useTransactionDetail(
  transactionId: string,
  initialData: TxnRow | null,
  onClose: () => void,
  onTransactionUpdated: (updated: TxnRow) => void,
) {
  const [txn, setTxn] = useState<TxnRow | null>(initialData);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(initialData?.reviewed ?? false);
  const [reviewPending, startReviewTransition] = useTransition();
  const [transferPending, startTransferTransition] = useTransition();
  const [hiddenPending, startHiddenTransition] = useTransition();

  const onCloseRef = useRef(onClose);
  const onUpdatedRef = useRef(onTransactionUpdated);
  useEffect(() => {
    onCloseRef.current = onClose;
    onUpdatedRef.current = onTransactionUpdated;
  });

  const { splits, resetSplits, addSplit, updateSplit, removeSplit } = useSplitEditor();

  const detailLoaded = loadedId === transactionId;

  useEffect(() => {
    let cancelled = false;

    fetchTransactionDetail(transactionId).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        onCloseRef.current();
        return;
      }
      const detail = result.data;
      setTxn(detail);
      resetSplits(detail.splits);
      setReviewed(detail.reviewed);
      setLoadedId(transactionId);
    });

    return () => { cancelled = true; };
  }, [transactionId, resetSplits]);

  const handleFieldSave = useCallback(
    async (field: "name" | "notes" | "date", value: string) => {
      const result = await updateTransactionFields(transactionId, { [field]: value });
      if ("success" in result && txn) {
        const updated = { ...txn, [field]: value };
        setTxn(updated);
        onUpdatedRef.current(updated);
      }
      return result;
    },
    [transactionId, txn],
  );

  // Turning the flag off also unpairs both legs server-side, so the local row
  // has to drop transferPairId with it or the "Paired with" row keeps offering
  // a link to a transaction that is no longer paired.
  const handleTransferToggle = useCallback(
    (next: boolean) => {
      if (!txn) return;
      const prev = txn;
      const optimistic: TxnRow = {
        ...txn,
        isTransfer: next,
        transferSource: next ? "manual" : "manual_rejected",
        transferPairId: next ? txn.transferPairId : null,
      };
      setTxn(optimistic);
      onUpdatedRef.current(optimistic);

      startTransferTransition(async () => {
        const result = await updateTransactionFields(transactionId, { isTransfer: next });
        if ("error" in result) {
          setTxn(prev);
          onUpdatedRef.current(prev);
        }
      });
    },
    [transactionId, txn],
  );

  const handleHiddenToggle = useCallback(
    (next: boolean) => {
      if (!txn) return;
      const prev = txn;
      const optimistic: TxnRow = { ...txn, isHidden: next };
      setTxn(optimistic);
      onUpdatedRef.current(optimistic);

      startHiddenTransition(async () => {
        const result = await updateTransactionFields(transactionId, { isHidden: next });
        if ("error" in result) {
          setTxn(prev);
          onUpdatedRef.current(prev);
        }
      });
    },
    [transactionId, txn],
  );

  const handleReviewedToggle = useCallback(() => {
    const prev = reviewed;
    setReviewed(!prev);
    startReviewTransition(async () => {
      const result = await toggleReviewed(transactionId);
      if ("error" in result) setReviewed(prev);
      else if (txn) onUpdatedRef.current({ ...txn, reviewed: result.reviewed });
    });
  }, [reviewed, transactionId, txn]);

  return {
    txn,
    splits,
    reviewed,
    reviewPending,
    transferPending,
    hiddenPending,
    detailLoaded,
    handleFieldSave,
    handleReviewedToggle,
    handleTransferToggle,
    handleHiddenToggle,
    handleAddSplit: addSplit,
    handleSplitUpdate: updateSplit,
    handleSplitDelete: removeSplit,
  };
}
