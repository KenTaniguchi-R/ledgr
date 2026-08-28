import { describe, it, expect, vi } from "vitest";
import { runDailySimplefinSync } from "./daily-simplefin-sync";
import type { SyncResult } from "@/lib/simplefin/sync";
import type { LedgrDb } from "@/db";

describe("runDailySimplefinSync", () => {
  const fakeDb = {} as LedgrDb;
  const noStaleDrafts = () => vi.fn().mockResolvedValue(0);

  it("calls syncConnection for each active connection and logs a summary", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const list = vi.fn().mockResolvedValue([
      { connectionId: "conn-1", householdId: "hh-1" },
      { connectionId: "conn-2", householdId: "hh-2" },
    ]);
    const sync = vi.fn().mockResolvedValue({ success: true } as SyncResult);

    await runDailySimplefinSync({
      db: fakeDb,
      listConnections: list,
      syncOne: sync,
      cleanupStaleDrafts: noStaleDrafts(),
    });

    expect(sync).toHaveBeenCalledTimes(2);
    expect(sync).toHaveBeenNthCalledWith(1, "conn-1", "hh-1", fakeDb);
    expect(sync).toHaveBeenNthCalledWith(2, "conn-2", "hh-2", fakeDb);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("simplefin-sync: 2 connections, 2 success, 0 error"),
    );
  });

  it("isolates per-connection failures and reports them in the summary", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const list = vi.fn().mockResolvedValue([
      { connectionId: "conn-1", householdId: "hh-1" },
      { connectionId: "conn-2", householdId: "hh-2" },
      { connectionId: "conn-3", householdId: "hh-3" },
    ]);
    const sync = vi
      .fn()
      .mockResolvedValueOnce({ success: true } as SyncResult)
      .mockRejectedValueOnce(new Error("simplefin 500"))
      .mockResolvedValueOnce({ success: false, error: "revoked" } as SyncResult);

    await runDailySimplefinSync({
      db: fakeDb,
      listConnections: list,
      syncOne: sync,
      cleanupStaleDrafts: noStaleDrafts(),
    });

    expect(sync).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("simplefin-sync: 3 connections, 1 success, 2 error"),
    );
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("[scheduler] simplefin-sync connection conn-2"),
      expect.any(Error),
    );
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("[scheduler] simplefin-sync connection conn-3"),
      "revoked",
    );
  });

  it("logs and returns cleanly when there are no connections", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const sync = vi.fn();

    await runDailySimplefinSync({
      db: fakeDb,
      listConnections: vi.fn().mockResolvedValue([]),
      syncOne: sync,
      cleanupStaleDrafts: noStaleDrafts(),
    });

    expect(sync).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("simplefin-sync: 0 connections"),
    );
  });

  it("sweeps stale drafts before syncing and includes the count in the summary", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const cleanup = vi.fn().mockResolvedValue(3);

    await runDailySimplefinSync({
      db: fakeDb,
      listConnections: vi.fn().mockResolvedValue([]),
      syncOne: vi.fn(),
      cleanupStaleDrafts: cleanup,
    });

    expect(cleanup).toHaveBeenCalledWith(fakeDb);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("3 stale draft(s) cleaned"));
  });

  it("continues syncing even if the stale-draft cleanup itself throws", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const list = vi.fn().mockResolvedValue([{ connectionId: "conn-1", householdId: "hh-1" }]);
    const sync = vi.fn().mockResolvedValue({ success: true } as SyncResult);
    const cleanup = vi.fn().mockRejectedValue(new Error("db error"));

    await runDailySimplefinSync({
      db: fakeDb,
      listConnections: list,
      syncOne: sync,
      cleanupStaleDrafts: cleanup,
    });

    expect(sync).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("stale-draft cleanup threw"),
      expect.any(Error),
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining("0 stale draft(s) cleaned"));
  });
});
