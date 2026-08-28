import { db as defaultDb, type LedgrDb } from "@/db";
import {
  listActiveSimplefinConnections,
  cleanupStaleDraftConnections,
  type ActiveSimplefinConnectionRef,
} from "@/lib/simplefin/queries";
import { syncConnection, type SyncResult } from "@/lib/simplefin/sync";

type Deps = {
  db?: LedgrDb;
  listConnections?: (db: LedgrDb) => Promise<ActiveSimplefinConnectionRef[]>;
  syncOne?: (
    connectionId: string,
    householdId: string,
    db: LedgrDb,
  ) => Promise<SyncResult>;
  cleanupStaleDrafts?: (db: LedgrDb) => Promise<number>;
};

/**
 * Daily SimpleFIN sync: iterates every active SimpleFIN connection and calls
 * syncConnection. Unlike Plaid, SimpleFIN has no webhooks at all, so this poll
 * is the *only* sync trigger — there's no "safety sync backstop" framing here,
 * this is the whole sync path. Also sweeps abandoned two-step-connect drafts
 * (see cleanupStaleDraftConnections).
 *
 * Connections are processed sequentially with per-connection error isolation,
 * mirroring runDailySafetySync — one bad connection can't poison the run.
 */
export async function runDailySimplefinSync(deps: Deps = {}): Promise<void> {
  const db = deps.db ?? defaultDb;
  const listConnections = deps.listConnections ?? listActiveSimplefinConnections;
  const syncOne = deps.syncOne ?? syncConnection;
  const cleanupStaleDrafts = deps.cleanupStaleDrafts ?? cleanupStaleDraftConnections;

  let cleaned = 0;
  try {
    cleaned = await cleanupStaleDrafts(db);
  } catch (err) {
    console.error("[scheduler] simplefin-sync stale-draft cleanup threw:", err);
  }

  const connections = await listConnections(db);

  let successes = 0;
  let errors = 0;

  for (const { connectionId, householdId } of connections) {
    try {
      const result = await syncOne(connectionId, householdId, db);
      if (result.success) {
        successes++;
      } else {
        errors++;
        console.error(
          `[scheduler] simplefin-sync connection ${connectionId} returned error:`,
          result.error,
        );
      }
    } catch (err) {
      errors++;
      console.error(`[scheduler] simplefin-sync connection ${connectionId} threw:`, err);
    }
  }

  console.log(
    `[scheduler] simplefin-sync: ${connections.length} connections, ${successes} success, ${errors} error; ` +
      `${cleaned} stale draft(s) cleaned`,
  );
}
