"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import {
  fetchTransactionDetail,
  updateTransactionFields,
  deleteSplit,
} from "@/actions/transaction-detail";
import { toggleReviewed } from "@/actions/transactions";
import type { TransactionRow as TxnRow, SplitRow } from "@/queries/transactions";

export function useTransactionDetail(
  transactionId: string,
  initialData: TxnRow | null,
  callbacks: {
    onClose: () => void;
    onTransactionUpdated: (updated: TxnRow) => void;
  },
) {
  const [txn, setTxn] = useState<TxnRow | null>(initialData);
  const [splits, setSplits] = useState<(SplitRow & { isDraft?: boolean })[]>([]);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(initialData?.reviewed ?? false);
  const [reviewPending, startReviewTransition] = useTransition();

  const detailLoaded = loadedId === transactionId;

  useEffect(() => {
    let cancelled = false;

    fetchTransactionDetail(transactionId).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        callbacks.onClose();
        return;
      }
      const detail = result.data;
      setTxn(detail);
      setSplits(detail.splits);
      setReviewed(detail.reviewed);
      setLoadedId(transactionId);
    });

    return () => { cancelled = true; };
  }, [transactionId, callbacks.onClose]);

  const handleFieldSave = useCallback(
    async (field: string, value: string) => {
      const result = await updateTransactionFields(transactionId, { [field]: value });
      if ("success" in result && txn) {
        const updated = { ...txn, [field]: value };
        setTxn(updated);
        callbacks.onTransactionUpdated(updated);
      }
      return result;
    },
    [transactionId, txn, callbacks.onTransactionUpdated],
  );

  const handleReviewedToggle = useCallback(() => {
    const prev = reviewed;
    setReviewed(!prev);
    startReviewTransition(async () => {
      const result = await toggleReviewed(transactionId);
      if ("error" in result) setReviewed(prev);
      else if (txn) callbacks.onTransactionUpdated({ ...txn, reviewed: result.reviewed });
    });
  }, [reviewed, transactionId, txn, callbacks.onTransactionUpdated]);

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
      prev.map((s) => {
        if (s.id !== updated.id && !(s.isDraft && s.id.startsWith("draft-"))) return s;
        const stillDraft = updated.id.startsWith("draft-");
        return { ...updated, isDraft: stillDraft };
      }),
    );
  }, []);

  const handleSplitDelete = useCallback(
    async (splitId: string) => {
      if (splitId.startsWith("draft-")) {
        setSplits((s) => s.filter((r) => r.id !== splitId));
        return;
      }

      let snapshot: (SplitRow & { isDraft?: boolean })[] = [];
      setSplits((s) => {
        snapshot = s;
        return s.filter((r) => r.id !== splitId);
      });

      const result = await deleteSplit(splitId);
      if ("error" in result) setSplits(snapshot);
    },
    [],
  );

  return {
    txn,
    splits,
    reviewed,
    reviewPending,
    detailLoaded,
    handleFieldSave,
    handleReviewedToggle,
    handleAddSplit,
    handleSplitUpdate,
    handleSplitDelete,
  };
}
