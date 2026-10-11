"use client";

import { useCallback, useState } from "react";
import { updateTransactionFields } from "@/actions/transaction-detail";
import type { TransactionRow } from "@/queries/transactions";

export type TransactionPatch = Partial<Omit<TransactionRow, "id">>;

/**
 * The client-side copy of a ledger's rows, shared by every surface that lists
 * transactions (the Transactions page, report drill-downs). Every edit — from a
 * row, the detail panel or a bulk action — lands here as a patch, so there is
 * one place a row changes and one shape the change takes.
 *
 * All callbacks are stable, so memoised rows only re-render when their own row
 * does.
 */
export function useTransactionRows(initialRows: TransactionRow[] = []) {
  const [rows, setRows] = useState(initialRows);

  const patchRow = useCallback((id: string, patch: TransactionPatch) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const appendRows = useCallback((more: TransactionRow[]) => {
    setRows((prev) => [...prev, ...more]);
  }, []);

  // Optimistic, and rolled back by flipping the one field rather than by
  // restoring a snapshot of the list, which would also undo any edit made to
  // another row while the request was in flight.
  const setHidden = useCallback(
    (id: string, hidden: boolean) => {
      patchRow(id, { isHidden: hidden });
      updateTransactionFields(id, { isHidden: hidden }).then((result) => {
        if ("error" in result) patchRow(id, { isHidden: !hidden });
      });
    },
    [patchRow],
  );

  return { rows, setRows, patchRow, appendRows, setHidden };
}
