import { describe, it, expect, vi } from "vitest";
import { checkBalanceHistoryGap } from "./startup-backfill-check";
import type { LedgrDb } from "@/db";

describe("checkBalanceHistoryGap", () => {
  const fakeDb = {} as LedgrDb;

  it("does nothing when the last snapshot is recent", async () => {
    const backfill = vi.fn();
    const today = new Date().toISOString().slice(0, 10);

    await checkBalanceHistoryGap({
      db: fakeDb,
      getLastSnapshotDate: vi.fn().mockResolvedValue(today),
      backfill,
    });

    expect(backfill).not.toHaveBeenCalled();
  });

  it("triggers a backfill and warns when the gap exceeds the threshold", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const backfill = vi.fn().mockResolvedValue(undefined);

    const staleDate = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 10);
      return d.toISOString().slice(0, 10);
    })();

    await checkBalanceHistoryGap({
      db: fakeDb,
      getLastSnapshotDate: vi.fn().mockResolvedValue(staleDate),
      backfill,
    });

    expect(backfill).toHaveBeenCalledWith(fakeDb);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("balance_history gap detected"));
  });

  it("triggers a backfill when there are no snapshots at all", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const backfill = vi.fn().mockResolvedValue(undefined);

    await checkBalanceHistoryGap({
      db: fakeDb,
      getLastSnapshotDate: vi.fn().mockResolvedValue(null),
      backfill,
    });

    expect(backfill).toHaveBeenCalledWith(fakeDb);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no balance_history snapshots found"));
  });

  it("logs an error but does not throw when the backfill itself fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const backfill = vi.fn().mockRejectedValue(new Error("db unreachable"));

    await expect(
      checkBalanceHistoryGap({
        db: fakeDb,
        getLastSnapshotDate: vi.fn().mockResolvedValue(null),
        backfill,
      }),
    ).resolves.toBeUndefined();

    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("startup backfill failed"),
      expect.any(Error),
    );
  });
});
