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

  // Splits persist themselves (see TransactionSplitRow), but nothing else
  // tracks that the transaction gained or lost its split status — derive
  // `hasSplits` from the split list and mirror it up whenever it actually
  // changes, or the row behind the panel keeps showing a stale, editable
  // category pill for a transaction that's now split.
  useEffect(() => {
    const hasSplits = splits.some((s) => !s.isDraft);
    setTxn((prev) => {
      if (!prev || prev.hasSplits === hasSplits) return prev;
      const updated = { ...prev, hasSplits };
      onUpdatedRef.current(updated);
      return updated;
    });
  }, [splits]);

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

  // CategoryPill saves the category itself (it also owns the merchant-default
  // conflict prompt), so this just mirrors the result into local/list state
  // once it succeeds — otherwise the row behind the panel, and the panel
  // itself if reopened, keep showing the category from before the edit.
  const handleCategorySave = useCallback(
    (categoryId: string | null, categoryName: string | null) => {
      if (!txn) return;
      const updated = { ...txn, categoryId, categoryName };
      setTxn(updated);
      onUpdatedRef.current(updated);
    },
    [txn],
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
    handleCategorySave,
    handleReviewedToggle,
    handleTransferToggle,
    handleHiddenToggle,
    handleAddSplit: addSplit,
    handleSplitUpdate: updateSplit,
    handleSplitDelete: removeSplit,
  };
}
