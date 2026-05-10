import cron from "node-cron";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { plaidItems } from "@/db/schema";
import { syncInstitution } from "@/lib/plaid/sync";

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

  console.log("[scheduler] Started (transaction sync every 4 hours)");
}
