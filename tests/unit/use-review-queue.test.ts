// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useReviewQueue } from "../../src/hooks/use-review-queue";
import type { TransactionRow } from "../../src/queries/transactions";

function makeTxn(overrides: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: `txn-${Math.random().toString(36).slice(2)}`,
    date: "2026-05-01",
    name: "Test",
    originalName: "Test",
    amount: -1000,
    normalizedAmount: -1000,
    currency: "USD",
    pending: false,
    reviewed: false,
    accountId: "acc-1",
    accountName: "Checking",
    merchantId: null,
    merchantName: null,
    merchantLogoUrl: null,
    categoryId: null,
    categoryName: null,
    categoryGroupName: null,
    categoryIcon: null,
    pfcPrimary: null,
    notes: null,
    hasSplits: false,
    isTransfer: false,
    transferPairId: null,
    categorySource: null,
    plaidTransactionId: null,
    ...overrides,
  };
}

describe("useReviewQueue", () => {
  it("initializes in IDLE phase with empty queue", () => {
    const rows = [makeTxn(), makeTxn({ reviewed: true })];
    const { result } = renderHook(() => useReviewQueue(rows));
    expect(result.current.phase).toBe("IDLE");
    expect(result.current.currentTransaction).toBeNull();
  });

  it("transitions to VIEWING on start, filtering out reviewed and pending", () => {
    const rows = [
      makeTxn({ reviewed: false, pending: false }),
      makeTxn({ reviewed: true }),
      makeTxn({ pending: true }),
    ];
    const { result } = renderHook(() => useReviewQueue(rows));

    act(() => result.current.start());
    expect(result.current.phase).toBe("VIEWING");
    expect(result.current.currentTransaction).toBe(rows[0]);
    expect(result.current.queueLength).toBe(1);
  });

  it("advances through queue and reaches COMPLETE", async () => {
    const rows = [makeTxn(), makeTxn()];
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useReviewQueue(rows, onConfirm));

    act(() => result.current.start());
    expect(result.current.currentIndex).toBe(0);

    await act(async () => { await result.current.confirm(); });
    expect(onConfirm).toHaveBeenCalledWith(rows[0].id);
    expect(result.current.currentIndex).toBe(1);

    await act(async () => { await result.current.confirm(); });
    expect(result.current.phase).toBe("COMPLETE");
  });

  it("returns to VIEWING on confirm error", async () => {
    const rows = [makeTxn(), makeTxn()];
    const onConfirm = vi.fn().mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useReviewQueue(rows, onConfirm));

    act(() => result.current.start());
    expect(result.current.phase).toBe("VIEWING");

    await act(async () => { await result.current.confirm(); });
    expect(result.current.phase).toBe("VIEWING");
    expect(result.current.sessionReviewedCount).toBe(0);
  });

  it("enters SAVING phase during confirm", async () => {
    let resolveConfirm: () => void;
    const confirmPromise = new Promise<void>((resolve) => { resolveConfirm = resolve; });
    const onConfirm = vi.fn().mockReturnValue(confirmPromise);
    const rows = [makeTxn()];
    const { result } = renderHook(() => useReviewQueue(rows, onConfirm));

    act(() => result.current.start());

    // Don't await — check intermediate state
    let confirmDone: Promise<void>;
    act(() => { confirmDone = result.current.confirm(); });
    expect(result.current.phase).toBe("SAVING");

    await act(async () => {
      resolveConfirm!();
      await confirmDone!;
    });
    expect(result.current.phase).toBe("COMPLETE");
  });

  it("skip advances without confirming", () => {
    const rows = [makeTxn(), makeTxn()];
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useReviewQueue(rows, onConfirm));

    act(() => result.current.start());
    act(() => result.current.skip());

    expect(onConfirm).not.toHaveBeenCalled();
    expect(result.current.currentIndex).toBe(1);
  });

  it("retreat goes back", () => {
    const rows = [makeTxn(), makeTxn()];
    const { result } = renderHook(() => useReviewQueue(rows));

    act(() => result.current.start());
    act(() => result.current.skip());
    expect(result.current.currentIndex).toBe(1);

    act(() => result.current.retreat());
    expect(result.current.currentIndex).toBe(0);
  });
});
