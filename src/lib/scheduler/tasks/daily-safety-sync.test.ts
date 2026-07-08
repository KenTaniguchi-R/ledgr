import { describe, it, expect, vi } from "vitest";
import { runDailySafetySync } from "./daily-safety-sync";
import type { SyncResult } from "@/lib/plaid/sync";
import type { InvestmentSyncResult } from "@/lib/plaid/investments-process";
import type { LedgrDb } from "@/db";

describe("runDailySafetySync", () => {
  const fakeDb = {} as LedgrDb;
  const okInvest = () =>
    vi.fn().mockResolvedValue({ success: true } as InvestmentSyncResult);

  it("calls syncInstitution for each active item and logs a summary", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const list = vi.fn().mockResolvedValue([
      { itemId: "it-1", householdId: "hh-1" },
      { itemId: "it-2", householdId: "hh-2" },
    ]);
    const sync = vi.fn().mockResolvedValue({ success: true } as SyncResult);

    await runDailySafetySync({
      db: fakeDb,
      listItems: list,
      syncOne: sync,
      syncInvestmentsOne: okInvest(),
    });

    expect(sync).toHaveBeenCalledTimes(2);
    expect(sync).toHaveBeenNthCalledWith(1, "it-1", "hh-1", fakeDb);
    expect(sync).toHaveBeenNthCalledWith(2, "it-2", "hh-2", fakeDb);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("safety-sync: 2 items, 2 success, 0 error"),
    );
  });

  it("isolates per-item failures and reports them in the summary", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const list = vi.fn().mockResolvedValue([
      { itemId: "it-1", householdId: "hh-1" },
      { itemId: "it-2", householdId: "hh-2" },
      { itemId: "it-3", householdId: "hh-3" },
    ]);
    const sync = vi
      .fn()
      .mockResolvedValueOnce({ success: true } as SyncResult)
      .mockRejectedValueOnce(new Error("plaid 500"))
      .mockResolvedValueOnce({ success: false, error: "rate limited" } as SyncResult);

    await runDailySafetySync({
      db: fakeDb,
      listItems: list,
      syncOne: sync,
      syncInvestmentsOne: okInvest(),
    });

    expect(sync).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("safety-sync: 3 items, 1 success, 2 error"),
    );
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("[scheduler] safety-sync item it-2"),
      expect.any(Error),
    );
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("[scheduler] safety-sync item it-3"),
      "rate limited",
    );
  });

  it("logs and returns cleanly when there are no items", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const sync = vi.fn();
    const invest = okInvest();

    await runDailySafetySync({
      db: fakeDb,
      listItems: vi.fn().mockResolvedValue([]),
      syncOne: sync,
      syncInvestmentsOne: invest,
    });

    expect(sync).not.toHaveBeenCalled();
    expect(invest).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("safety-sync: 0 items"),
    );
  });

  it("also syncs investments for each active item as a backstop", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    const list = vi.fn().mockResolvedValue([
      { itemId: "it-1", householdId: "hh-1" },
      { itemId: "it-2", householdId: "hh-2" },
    ]);
    const sync = vi.fn().mockResolvedValue({ success: true } as SyncResult);
    const invest = vi
      .fn()
      .mockResolvedValue({ success: true } as InvestmentSyncResult);

    await runDailySafetySync({
      db: fakeDb,
      listItems: list,
      syncOne: sync,
      syncInvestmentsOne: invest,
    });

    expect(invest).toHaveBeenCalledTimes(2);
    expect(invest).toHaveBeenNthCalledWith(1, "it-1", "hh-1", fakeDb);
    expect(invest).toHaveBeenNthCalledWith(2, "it-2", "hh-2", fakeDb);
  });

  it("isolates investment-sync failures from the transaction-sync result", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const list = vi.fn().mockResolvedValue([
      { itemId: "it-1", householdId: "hh-1" },
      { itemId: "it-2", householdId: "hh-2" },
    ]);
    // Transactions succeed for both items.
    const sync = vi.fn().mockResolvedValue({ success: true } as SyncResult);
    // Investments: one throws, one returns a soft error.
    const invest = vi
      .fn()
      .mockRejectedValueOnce(new Error("holdings 500"))
      .mockResolvedValueOnce({
        success: false,
        error: "transient",
      } as InvestmentSyncResult);

    await runDailySafetySync({
      db: fakeDb,
      listItems: list,
      syncOne: sync,
      syncInvestmentsOne: invest,
    });

    // Transaction sync results are unaffected by investment failures.
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("safety-sync: 2 items, 2 success, 0 error"),
    );
    // Investment failures are surfaced separately.
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("investments 0 success, 2 error"),
    );
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("[scheduler] safety-sync investments item it-1"),
      expect.any(Error),
    );
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("[scheduler] safety-sync investments item it-2"),
      "transient",
    );
  });
});
