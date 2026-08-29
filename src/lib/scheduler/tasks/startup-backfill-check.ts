import { db as defaultDb, type LedgrDb } from "@/db";
import { getLastSnapshotDate as defaultGetLastSnapshotDate } from "@/lib/jobs/snapshot-balances";
import { backfillAccountBalances as defaultBackfillAccountBalances } from "@/lib/jobs/backfill-balances";
import { todayDateString } from "@/lib/date-utils";

/** Beyond this many days without a snapshot, assume the server was down through one or more nightly windows. */
const GAP_WARNING_DAYS = 2;

type Deps = {
  db?: LedgrDb;
  getLastSnapshotDate?: (db: LedgrDb) => Promise<string | null>;
  backfill?: (db: LedgrDb) => Promise<void>;
};

/**
 * Runs once at server startup. Self-hosted containers aren't guaranteed to run
 * 24/7, and balance_history is otherwise only ever written by the nightly
 * cron — so any downtime through that window leaves a permanent,
 * unrecoverable gap in net-worth history unless something notices and
 * backfills it. This is that something.
 */
export async function checkBalanceHistoryGap(deps: Deps = {}): Promise<void> {
  const db = deps.db ?? defaultDb;
  const getLastSnapshotDate = deps.getLastSnapshotDate ?? defaultGetLastSnapshotDate;
  const backfill = deps.backfill ?? defaultBackfillAccountBalances;

  const lastDate = await getLastSnapshotDate(db);
  const gapDays = lastDate
    ? Math.floor((Date.parse(todayDateString()) - Date.parse(lastDate)) / 86_400_000)
    : Infinity;

  if (gapDays <= GAP_WARNING_DAYS) return;

  console.warn(
    lastDate
      ? `[scheduler] balance_history gap detected: last snapshot was ${lastDate} (${gapDays} days ago) — running backfill`
      : "[scheduler] no balance_history snapshots found — running backfill",
  );

  try {
    await backfill(db);
  } catch (err) {
    console.error("[scheduler] startup backfill failed", err);
  }
}
