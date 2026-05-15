import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./setup";
import type { LedgrDb } from "@/db";
import { households, accounts, balanceHistory } from "@/db/schema";
import { runNightlySnapshot } from "@/lib/scheduler/tasks/nightly-snapshot";
import { runDailySafetySync } from "@/lib/scheduler/tasks/daily-safety-sync";
import type { SyncResult } from "@/lib/plaid/sync";

describe("scheduler tasks (integration)", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });
  afterAll(async () => {
    await close();
  });

  describe("runNightlySnapshot", () => {
    it("writes a balance_history row per active account", async () => {
      await db.insert(households).values({ id: "hh-snap", name: "Snap HH" });
      await db.insert(accounts).values([
        {
          id: "acc-snap-1",
          householdId: "hh-snap",
          name: "Checking",
          type: "checking",
          currentBalance: 123456,
        },
        {
          id: "acc-snap-2",
          householdId: "hh-snap",
          name: "Hidden",
          type: "checking",
          currentBalance: 9999,
          isHidden: true,
        },
      ]);

      await runNightlySnapshot(db);

      const rows = await db
        .select()
        .from(balanceHistory)
        .where(eq(balanceHistory.accountId, "acc-snap-1"));
      expect(rows.length).toBe(1);
      expect(rows[0].balance).toBe(123456);

      const hidden = await db
        .select()
        .from(balanceHistory)
        .where(eq(balanceHistory.accountId, "acc-snap-2"));
      expect(hidden.length).toBe(0);
    });
  });

  describe("runDailySafetySync", () => {
    it("only invokes sync for items returned by listActivePlaidItems", async () => {
      const syncOne = vi
        .fn<typeof import("@/lib/plaid/sync").syncInstitution>()
        .mockResolvedValue({ success: true } as SyncResult);

      await runDailySafetySync({ db, syncOne });

      // The previous test added a household but no plaid_items, so this should
      // see zero items and not call syncOne.
      expect(syncOne).not.toHaveBeenCalled();
    });
  });
});
