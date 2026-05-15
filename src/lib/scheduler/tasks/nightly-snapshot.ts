import { db as defaultDb, type LedgrDb } from "@/db";
import { snapshotBalances } from "@/lib/jobs/snapshot-balances";

/**
 * Nightly: write today's balance_history row for every active account.
 * Domain logic lives in snapshotBalances() — this is just the scheduler-facing
 * orchestrator (kept separate so it can take a db handle for testing).
 */
export async function runNightlySnapshot(db: LedgrDb = defaultDb): Promise<void> {
  await snapshotBalances(db);
}
