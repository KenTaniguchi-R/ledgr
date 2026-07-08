import { db as defaultDb, type LedgrDb } from "@/db";
import {
  listActivePlaidItems,
  type ActivePlaidItemRef,
} from "@/lib/plaid/queries";
import { syncInstitution, type SyncResult } from "@/lib/plaid/sync";
import { syncInvestments } from "@/lib/plaid/investments-sync";
import type { InvestmentSyncResult } from "@/lib/plaid/investments-process";

type Deps = {
  db?: LedgrDb;
  listItems?: (db: LedgrDb) => Promise<ActivePlaidItemRef[]>;
  syncOne?: (
    itemId: string,
    householdId: string,
    db: LedgrDb,
  ) => Promise<SyncResult>;
  syncInvestmentsOne?: (
    itemId: string,
    householdId: string,
    db: LedgrDb,
  ) => Promise<InvestmentSyncResult>;
};

/**
 * Daily safety-sync: iterates every active Plaid item and calls syncInstitution.
 * Acts as a backstop for missed webhooks.
 *
 * Investments are refreshed in the same pass. Unlike transactions, Plaid does not
 * drive investment updates through the SYNC_UPDATES_AVAILABLE webhook we handle, so
 * without this backstop holdings only refresh on manual sync or at link time and go
 * stale in between. Items without investment accounts skip cleanly inside
 * syncInvestments (SKIP_ERROR_CODES), and investments is a per-item subscription
 * product, so the daily refresh adds no per-call billing.
 *
 * Per-item errors are isolated so one bad item can't poison the whole run, and an
 * investment-sync failure never affects the transaction-sync result. Items are
 * processed sequentially — Plaid has tight rate limits and self-hosters typically
 * have a handful of items, so concurrency isn't worth the complexity.
 */
export async function runDailySafetySync(deps: Deps = {}): Promise<void> {
  const db = deps.db ?? defaultDb;
  const listItems = deps.listItems ?? listActivePlaidItems;
  const syncOne = deps.syncOne ?? syncInstitution;
  const syncInvestmentsOne = deps.syncInvestmentsOne ?? syncInvestments;

  const items = await listItems(db);

  let successes = 0;
  let errors = 0;
  let invSuccesses = 0;
  let invErrors = 0;

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

    try {
      const invResult = await syncInvestmentsOne(itemId, householdId, db);
      if (invResult.success) {
        invSuccesses++;
      } else {
        invErrors++;
        console.error(
          `[scheduler] safety-sync investments item ${itemId} returned error:`,
          invResult.error,
        );
      }
    } catch (err) {
      invErrors++;
      console.error(
        `[scheduler] safety-sync investments item ${itemId} threw:`,
        err,
      );
    }
  }

  console.log(
    `[scheduler] safety-sync: ${items.length} items, ${successes} success, ${errors} error; ` +
      `investments ${invSuccesses} success, ${invErrors} error`,
  );
}
