import { describe, it, expect, vi } from "vitest";
import { checkBalanceHistoryGap, largestGapDays } from "./startup-backfill-check";
import type { LedgrDb } from "@/db";

/** N days before `today`, as YYYY-MM-DD. */
function daysBefore(today: string, n: number): string {
  const d = new Date(today + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

describe("largestGapDays", () => {
  const today = "2026-08-29";

  it("is Infinity when there are no snapshots at all", () => {
    expect(largestGapDays([], today)).toBe(Infinity);
  });

  it("measures a hole in the middle of the series, not just staleness", () => {
    // The real-world shape this was written for: yesterday's snapshot exists,
    // so recency looks fine, but there is a 3.5-month hole behind it.
    const dates = ["2026-05-12", "2026-08-28"];
    expect(largestGapDays(dates, today)).toBeGreaterThan(100);
  });

  it("is small for a dense, current series", () => {
    const dates = [3, 2, 1, 0].map((n) => daysBefore(today, n));
    expect(largestGapDays(dates, today)).toBe(1);
  });

  it("counts the stretch from the newest snapshot to today", () => {
    expect(largestGapDays([daysBefore(today, 30)], today)).toBe(30);
  });
});

describe("checkBalanceHistoryGap", () => {
  const fakeDb = {} as LedgrDb;
  const today = new Date().toISOString().slice(0, 10);

  it("does nothing when history is dense and current", async () => {
    const backfill = vi.fn();
    await checkBalanceHistoryGap({
      db: fakeDb,
      getSnapshotDates: vi.fn().mockResolvedValue([2, 1, 0].map((n) => daysBefore(today, n))),
      backfill,
    });
    expect(backfill).not.toHaveBeenCalled();
  });

  it("backfills an interior gap even when the newest snapshot is recent", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const backfill = vi.fn().mockResolvedValue(undefined);

    await checkBalanceHistoryGap({
      db: fakeDb,
      getSnapshotDates: vi
        .fn()
        .mockResolvedValue([daysBefore(today, 108), daysBefore(today, 1)]),
      backfill,
    });

    expect(backfill).toHaveBeenCalledWith(fakeDb);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("balance_history gap"));
  });

  it("backfills when the newest snapshot is stale", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const backfill = vi.fn().mockResolvedValue(undefined);
    await checkBalanceHistoryGap({
      db: fakeDb,
      getSnapshotDates: vi.fn().mockResolvedValue([daysBefore(today, 30)]),
      backfill,
    });
    expect(backfill).toHaveBeenCalledWith(fakeDb);
  });

  it("backfills when there are no snapshots at all", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const backfill = vi.fn().mockResolvedValue(undefined);
    await checkBalanceHistoryGap({
      db: fakeDb,
      getSnapshotDates: vi.fn().mockResolvedValue([]),
      backfill,
    });
    expect(backfill).toHaveBeenCalledWith(fakeDb);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no balance_history snapshots"));
  });

  it("logs an error but does not throw when the backfill itself fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const backfill = vi.fn().mockRejectedValue(new Error("db unreachable"));

    await expect(
      checkBalanceHistoryGap({
        db: fakeDb,
        getSnapshotDates: vi.fn().mockResolvedValue([]),
        backfill,
      }),
    ).resolves.toBeUndefined();

    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("startup backfill failed"),
      expect.any(Error),
    );
  });
});
