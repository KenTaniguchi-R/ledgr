import { db as defaultDb, type LedgrDb } from "@/db";
import { households } from "@/db/schema";
import { applyTransferDetection } from "@/lib/transfer-detection";

/**
 * One-time operator job: runs applyTransferDetection for every household, so
 * historical transactions synced before automatic transfer detection existed
 * get tagged too. Non-destructive and idempotent — safe to re-run.
 *
 * Cross-household by design (an operator maintenance job, run via `pnpm
 * backfill-transfers` — not reachable from the app), same shape as
 * backfill-balances.ts: loop one household at a time, each in its own
 * withHousehold transaction (applyTransferDetection already does this
 * internally per call).
 */
export async function backfillTransfers(db: LedgrDb = defaultDb): Promise<{ households: number; tagged: number }> {
  const allHouseholds = await db.select({ id: households.id }).from(households);

  let tagged = 0;
  for (const { id: householdId } of allHouseholds) {
    tagged += await applyTransferDetection(householdId, db);
  }

  return { households: allHouseholds.length, tagged };
}
