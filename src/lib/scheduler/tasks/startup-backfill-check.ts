import { db as defaultDb, type LedgrDb } from "@/db";
import { getSnapshotDates as defaultGetSnapshotDates } from "@/lib/jobs/snapshot-balances";
import { backfillAccountBalances as defaultBackfillAccountBalances } from "@/lib/jobs/backfill-balances";
import { todayDateString } from "@/lib/date-utils";

/** Beyond this many consecutive days with no snapshot, the series has a hole worth filling. */
const GAP_THRESHOLD_DAYS = 2;

const MS_PER_DAY = 86_400_000;

type Deps = {
  db?: LedgrDb;
  getSnapshotDates?: (db: LedgrDb) => Promise<string[]>;
  backfill?: (db: LedgrDb) => Promise<void>;
};

/**
 * Widest run of consecutive days with no snapshot, including the stretch from
 * the newest snapshot up to `today`. Infinity when there are none at all.
 *
 * Looking only at the newest snapshot is not enough: a nightly snapshot taken
 * yesterday says nothing about whether the months behind it are covered, and
 * downtime leaves exactly that shape — a current tail over an interior hole.
 */
export function largestGapDays(dates: string[], today: string): number {
  if (dates.length === 0) return Infinity;

  const sorted = [...dates].sort();
  let largest = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = (Date.parse(sorted[i]) - Date.parse(sorted[i - 1])) / MS_PER_DAY;
    if (gap > largest) largest = gap;
  }

  const trailing = (Date.parse(today) - Date.parse(sorted[sorted.length - 1])) / MS_PER_DAY;
  return Math.max(largest, trailing);
}

/**
 * Runs once at server startup. Self-hosted containers aren't guaranteed to run
 * 24/7, and balance_history is otherwise only ever written by the nightly
 * cron — so any downtime through that window leaves a gap in net-worth history
 * that nothing else repairs. The backfill is non-destructive
 * (onConflictDoNothing), so re-running it is always safe.
 */
export async function checkBalanceHistoryGap(deps: Deps = {}): Promise<void> {
  const db = deps.db ?? defaultDb;
  const getSnapshotDates = deps.getSnapshotDates ?? defaultGetSnapshotDates;
  const backfill = deps.backfill ?? defaultBackfillAccountBalances;

  const dates = await getSnapshotDates(db);
  const gap = largestGapDays(dates, todayDateString());

  if (gap <= GAP_THRESHOLD_DAYS) return;

  console.warn(
    dates.length === 0
      ? "[scheduler] no balance_history snapshots found — running backfill"
      : `[scheduler] balance_history gap of ${gap} days detected — running backfill`,
  );

  try {
    await backfill(db);
  } catch (err) {
    console.error("[scheduler] startup backfill failed", err);
  }
}
