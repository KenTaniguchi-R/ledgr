import { db as defaultDb, type LedgrDb } from "@/db";
import {
  listActivePlaidItems,
  type ActivePlaidItemRef,
} from "@/lib/plaid/queries";
import { syncInstitution, type SyncResult } from "@/lib/plaid/sync";

type Deps = {
  db?: LedgrDb;
  listItems?: (db: LedgrDb) => Promise<ActivePlaidItemRef[]>;
  syncOne?: (
    itemId: string,
    householdId: string,
    db: LedgrDb,
  ) => Promise<SyncResult>;
};

/**
 * Daily safety-sync: iterates every active Plaid item and calls syncInstitution.
 * Acts as a backstop for missed webhooks.
 *
 * Per-item errors are isolated so one bad item can't poison the whole run.
 * Items are processed sequentially — Plaid has tight rate limits and self-hosters
 * typically have a handful of items, so concurrency isn't worth the complexity.
 */
export async function runDailySafetySync(deps: Deps = {}): Promise<void> {
  const db = deps.db ?? defaultDb;
  const listItems = deps.listItems ?? listActivePlaidItems;
  const syncOne = deps.syncOne ?? syncInstitution;

  const items = await listItems(db);

  let successes = 0;
  let errors = 0;

  for (const { itemId, householdId } of items) {
    try {
      const result = await syncOne(itemId, householdId, db);
      if (result.success) {
        successes++;
      } else {
        errors++;
        console.error(
          `[scheduler] safety-sync item ${itemId} returned error:`,
          result.error,
        );
      }
    } catch (err) {
      errors++;
      console.error(`[scheduler] safety-sync item ${itemId} threw:`, err);
    }
  }

  console.log(
    `[scheduler] safety-sync: ${items.length} items, ${successes} success, ${errors} error`,
  );
}
