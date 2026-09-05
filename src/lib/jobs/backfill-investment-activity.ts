import { db as defaultDb, type LedgrDb } from "@/db";
import { households } from "@/db/schema";
import { applyInvestmentAccountTagging } from "@/lib/investment-account-tagging";
import { assertCanEnumerateHouseholds } from "@/lib/jobs/cross-household";

/**
 * One-time operator job: runs applyInvestmentAccountTagging for every
 * household, so historical transactions synced before the investment-account
 * exclusion existed get tagged too. Non-destructive and idempotent — safe to
 * re-run.
 *
 * Cross-household by design (an operator maintenance job, run via `pnpm
 * backfill-investment-activity` — not reachable from the app), same shape as
 * backfill-transfers.ts.
 */
export async function backfillInvestmentActivity(
  db: LedgrDb = defaultDb,
): Promise<{ households: number; tagged: number }> {
  await assertCanEnumerateHouseholds(db);
  const allHouseholds = await db.select({ id: households.id }).from(households);

  let tagged = 0;
  for (const { id: householdId } of allHouseholds) {
    const result = await applyInvestmentAccountTagging(householdId, db);
    tagged += result.tagged;
  }

  return { households: allHouseholds.length, tagged };
}
