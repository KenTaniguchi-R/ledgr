"use client";

import { useState, useCallback } from "react";
import { deleteSplit } from "@/actions/transaction-detail";
import type { SplitRow } from "@/queries/transactions";

export type DraftSplitRow = SplitRow & { isDraft?: boolean };

export function useSplitEditor(initialSplits: DraftSplitRow[] = []) {
  const [splits, setSplits] = useState<DraftSplitRow[]>(initialSplits);

  const resetSplits = useCallback((newSplits: DraftSplitRow[]) => {
    setSplits(newSplits);
  }, []);

  const addSplit = useCallback(() => {
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

  const updateSplit = useCallback((updated: SplitRow) => {
    setSplits((prev) =>
      prev.map((s) => {
        if (s.id !== updated.id && !(s.isDraft && s.id.startsWith("draft-"))) return s;
        const stillDraft = updated.id.startsWith("draft-");
        return { ...updated, isDraft: stillDraft };
      }),
    );
  }, []);

  const removeSplit = useCallback(async (splitId: string) => {
    if (splitId.startsWith("draft-")) {
      setSplits((s) => s.filter((r) => r.id !== splitId));
      return;
    }

    let snapshot: DraftSplitRow[] = [];
    setSplits((s) => {
      snapshot = s;
      return s.filter((r) => r.id !== splitId);
    });

    const result = await deleteSplit(splitId);
    if ("error" in result) setSplits(snapshot);
  }, []);

  return { splits, resetSplits, addSplit, updateSplit, removeSplit };
}
