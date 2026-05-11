import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "./setup";
import { insertHousehold, insertAccount } from "./helpers";
import { snapshotBalances } from "@/lib/jobs/scheduler";
import { balanceHistory } from "@/db/schema";
import type { LedgrDb } from "@/db";

describe("snapshotBalances", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  it("creates balance_history entries for active accounts", async () => {
    const { householdId } = await insertHousehold(db);
    const { accountId } = await insertAccount(db, householdId, { currentBalance: 5000 });

    await snapshotBalances(db);

    const rows = await db.select().from(balanceHistory);
    expect(rows).toHaveLength(1);
    expect(rows[0].accountId).toBe(accountId);
    expect(rows[0].balance).toBe(5000);
  });

  it("is idempotent — running twice on same day does not duplicate", async () => {
    const { db: db2, close: close2 } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db2);
      await insertAccount(db2, householdId, { currentBalance: 10000 });

      await snapshotBalances(db2);
      await snapshotBalances(db2);

      const rows = await db2.select().from(balanceHistory);
      expect(rows).toHaveLength(1);
    } finally {
      await close2();
    }
  });

  it("skips hidden, deleted, and null-balance accounts", async () => {
    const { db: db3, close: close3 } = await createTestDb();
    try {
      const { householdId } = await insertHousehold(db3);

      await insertAccount(db3, householdId, { currentBalance: 1000, isHidden: true });

      await insertAccount(db3, householdId, {
        currentBalance: 2000,
        deletedAt: new Date().toISOString(),
      });

      await insertAccount(db3, householdId, { currentBalance: undefined });

      await snapshotBalances(db3);

      const rows = await db3.select().from(balanceHistory);
      expect(rows).toHaveLength(0);
    } finally {
      await close3();
    }
  });
});
