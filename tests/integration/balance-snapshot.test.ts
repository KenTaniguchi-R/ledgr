import { describe, it, expect } from "vitest";
import { createTestDb } from "./setup";
import { insertHousehold, insertAccount } from "./helpers";
import { snapshotBalances } from "@/lib/jobs/scheduler";
import { balanceHistory } from "@/db/schema";

describe("snapshotBalances", () => {
  it("creates balance_history entries for active accounts", async () => {
    const { db, close } = createTestDb();
    try {
      const { householdId } = insertHousehold(db);
      const { accountId } = insertAccount(db, householdId, { currentBalance: 5000 });

      await snapshotBalances(db);

      const rows = db.select().from(balanceHistory).all();
      expect(rows).toHaveLength(1);
      expect(rows[0].accountId).toBe(accountId);
      expect(rows[0].balance).toBe(5000);
    } finally {
      close();
    }
  });

  it("is idempotent — running twice on same day does not duplicate", async () => {
    const { db, close } = createTestDb();
    try {
      const { householdId } = insertHousehold(db);
      insertAccount(db, householdId, { currentBalance: 10000 });

      await snapshotBalances(db);
      await snapshotBalances(db);

      const rows = db.select().from(balanceHistory).all();
      expect(rows).toHaveLength(1);
    } finally {
      close();
    }
  });

  it("skips hidden, deleted, and null-balance accounts", async () => {
    const { db, close } = createTestDb();
    try {
      const { householdId } = insertHousehold(db);

      // Hidden account with balance
      insertAccount(db, householdId, { currentBalance: 1000, isHidden: true });

      // Deleted account with balance
      insertAccount(db, householdId, {
        currentBalance: 2000,
        deletedAt: new Date().toISOString(),
      });

      // Active account with null balance
      insertAccount(db, householdId, { currentBalance: undefined });

      await snapshotBalances(db);

      const rows = db.select().from(balanceHistory).all();
      expect(rows).toHaveLength(0);
    } finally {
      close();
    }
  });
});
