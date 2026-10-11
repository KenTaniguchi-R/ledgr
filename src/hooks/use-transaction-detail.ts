"use client";

import { useState, useEffect, useCallback, useTransition, useRef } from "react";
import {
  fetchTransactionDetail,
  updateTransactionFields,
} from "@/actions/transaction-detail";
import { toggleReviewed } from "@/actions/transactions";
import type { TransactionRow as TxnRow } from "@/queries/transactions";
import type { TransactionPatch } from "./use-transaction-rows";
import { useSplitEditor } from "./use-split-editor";

type ActionResult = { error: string } | object;

/**
 * State for one open transaction. The panel keys itself by transaction id, so
 * this hook lives exactly as long as one transaction is shown and never has to
 * reset itself when the selection moves.
 *
 * The panel keeps its own copy because it can show a transaction the list
 * doesn't hold (the other leg of a transfer, a row on an unloaded page). Every
 * change goes through `applyPatch`, which updates that copy and mirrors the
 * same patch to the list behind the panel.
 */
export function useTransactionDetail(
  transactionId: string,
  initialData: TxnRow | null,
  onClose: () => void,
  onPatch: (id: string, patch: TransactionPatch) => void,
) {
  const [txn, setTxn] = useState<TxnRow | null>(initialData);
  const [detailLoaded, setDetailLoaded] = useState(false);
  const [reviewPending, startReviewTransition] = useTransition();
  const [transferPending, startTransferTransition] = useTransition();
  const [hiddenPending, startHiddenTransition] = useTransition();

  // The split status last reported to the list; null until the detail load
  // establishes it (see the hasSplits effect below).
  const mirroredHasSplits = useRef<boolean | null>(null);
  const onCloseRef = useRef(onClose);
  const onPatchRef = useRef(onPatch);
  useEffect(() => {
    onCloseRef.current = onClose;
    onPatchRef.current = onPatch;
  });

  const { splits, resetSplits, addSplit, updateSplit, removeSplit } = useSplitEditor();

  const applyPatch = useCallback(
    (patch: TransactionPatch) => {
      setTxn((prev) => (prev ? { ...prev, ...patch } : prev));
      onPatchRef.current(transactionId, patch);
    },
    [transactionId],
  );

  // Applies the patch now and persists it in the background. A failure puts
  // back only the fields this patch touched, so a concurrent edit to another
  // field survives the rollback.
  const optimistic = useCallback(
    (patch: TransactionPatch, persist: () => Promise<ActionResult>) => {
      if (!txn) return Promise.resolve();
      const rollback = Object.fromEntries(
        Object.keys(patch).map((k) => [k, txn[k as keyof TxnRow]]),
      ) as TransactionPatch;
      applyPatch(patch);
      return persist().then((result) => {
        if ("error" in result) applyPatch(rollback);
      });
    },
    [txn, applyPatch],
  );

  useEffect(() => {
    let cancelled = false;

    fetchTransactionDetail(transactionId).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        onCloseRef.current();
        return;
      }
      const { splits: detailSplits, ...detail } = result.data;
      setTxn(detail);
      resetSplits(detailSplits);
      mirroredHasSplits.current = detail.hasSplits;
      setDetailLoaded(true);
    });

    return () => { cancelled = true; };
  }, [transactionId, resetSplits]);

  // Splits persist themselves (see TransactionSplitRow), but nothing else
  // tracks that the transaction gained or lost its split status — derive it
  // from the split list and mirror it to the list, or the row behind the panel
  // keeps an editable category pill for a transaction that's now split. The
  // panel itself reads `splits` directly. Gated on the detail load: until then
  // the split list is empty only because it hasn't arrived.
  const hasSplits = splits.some((s) => !s.isDraft);
  useEffect(() => {
    if (mirroredHasSplits.current === null || mirroredHasSplits.current === hasSplits) return;
    mirroredHasSplits.current = hasSplits;
    onPatchRef.current(transactionId, { hasSplits });
  }, [transactionId, hasSplits]);

  const handleFieldSave = useCallback(
    async (field: "name" | "notes" | "date", value: string) => {
      const result = await updateTransactionFields(transactionId, { [field]: value });
      if ("success" in result) applyPatch({ [field]: value });
      return result;
    },
    [transactionId, applyPatch],
  );

  // Turning the flag off also unpairs both legs server-side, so the local row
  // has to drop transferPairId with it or the "Paired with" row keeps offering
  // a link to a transaction that is no longer paired.
  const handleTransferToggle = useCallback(
    (next: boolean) => {
      if (!txn) return;
      startTransferTransition(() =>
        optimistic(
          {
            isTransfer: next,
            transferSource: next ? "manual" : "manual_rejected",
            transferPairId: next ? txn.transferPairId : null,
          },
          () => updateTransactionFields(transactionId, { isTransfer: next }),
        ),
      );
    },
    [transactionId, txn, optimistic],
  );

  const handleHiddenToggle = useCallback(
    (next: boolean) => {
      startHiddenTransition(() =>
        optimistic({ isHidden: next }, () =>
          updateTransactionFields(transactionId, { isHidden: next }),
        ),
      );
    },
    [transactionId, optimistic],
  );

  // CategoryPill saves the category itself (it also owns the merchant-default
  // conflict prompt), so this only mirrors the saved result.
  const handleCategorySave = useCallback(
    (categoryId: string | null, categoryName: string | null) =>
      applyPatch({ categoryId, categoryName }),
    [applyPatch],
  );

  const handleReviewedToggle = useCallback(() => {
    if (!txn) return;
    startReviewTransition(() =>
      optimistic({ reviewed: !txn.reviewed }, () => toggleReviewed(transactionId)),
    );
  }, [transactionId, txn, optimistic]);

  return {
    txn,
    splits,
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
