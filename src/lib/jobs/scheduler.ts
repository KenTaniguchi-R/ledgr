import cron from "node-cron";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db, type LedgrDb } from "@/db";
import { plaidItems, accounts, balanceHistory } from "@/db/schema";
import { syncInstitution } from "@/lib/plaid/sync";
import { todayDateString } from "@/lib/date-utils";

export async function snapshotBalances(dbInstance: LedgrDb = db): Promise<void> {
  const activeAccounts = dbInstance
    .select({ id: accounts.id, currentBalance: accounts.currentBalance })
    .from(accounts)
    .where(
      and(
        isNull(accounts.deletedAt),
        eq(accounts.isHidden, false),
        isNotNull(accounts.currentBalance),
      )
    )
    .all();

  const date = todayDateString();

  for (const account of activeAccounts) {
    if (account.currentBalance === null) continue;
    dbInstance
      .insert(balanceHistory)
      .values({ id: uuid(), accountId: account.id, date, balance: account.currentBalance })
      .onConflictDoNothing({ target: [balanceHistory.accountId, balanceHistory.date] })
      .run();
  }
}

export function startScheduler() {
  // Transaction sync: every 4 hours
  cron.schedule("0 */4 * * *", async () => {
    console.log("[scheduler] Starting transaction sync job");

    const activeItems = db
      .select({
        id: plaidItems.id,
        householdId: plaidItems.householdId,
      })
      .from(plaidItems)
      .where(eq(plaidItems.status, "active"))
      .all();

    for (const item of activeItems) {
      try {
        const result = await syncInstitution(item.id, item.householdId, db);
        if (result.success) {
          console.log(
            `[scheduler] Synced ${item.id}: +${result.addedCount} ~${result.modifiedCount} -${result.removedCount}`
          );
        } else {
          console.error(`[scheduler] Sync failed for ${item.id}: ${result.error}`);
        }
      } catch (e) {
        console.error(`[scheduler] Unexpected error syncing ${item.id}:`, e);
      }
    }

    console.log("[scheduler] Transaction sync job complete");
  });

  // Balance snapshot: every day at midnight
  cron.schedule("0 0 * * *", async () => {
    console.log("[scheduler] Starting balance snapshot job");
    try {
      await snapshotBalances();
      console.log("[scheduler] Balance snapshot job complete");
    } catch (e) {
      console.error("[scheduler] Unexpected error during balance snapshot:", e);
    }
  });

  console.log("[scheduler] Started (transaction sync every 4 hours)");
}
