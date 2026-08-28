import { db as defaultDb, type LedgrDb } from "@/db";
import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "@/db/schema";

// `db.transaction(cb)` hands `cb` a PgTransaction, not a NodePgDatabase — the
// two share the query-builder surface (PgTransaction extends PgDatabase) but
// aren't the same type, so LedgrDb (typed as `typeof db`, which pins
// `$client: Pool`) doesn't accept a transaction. This is the common base
// both satisfy.
type LedgrQueryable = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * RLS PILOT — see docs/rls-pilot.md. Not wired into any call site yet.
 *
 * Runs `work` inside a Postgres transaction with `app.household_id` set via
 * SET LOCAL, so the household_isolation RLS policy on `transactions` (and,
 * eventually, the other household-scoped tables) can enforce isolation at
 * the database layer instead of relying on every call site remembering to
 * filter by householdId.
 *
 * SET LOCAL is transaction-scoped, not connection-scoped — it's reset on
 * COMMIT/ROLLBACK, so it's safe to use with a pooled connection: two
 * requests can never observe each other's household_id, even if pg reuses
 * the same underlying connection for both.
 *
 * This only matters if the DB role the app connects as lacks BYPASSRLS
 * (superusers, and roles with BYPASSRLS, skip RLS entirely). See
 * docs/rls-pilot.md for the role-separation prerequisite.
 */
export async function withHousehold<T>(
  householdId: string,
  work: (tx: LedgrQueryable) => Promise<T>,
  db: LedgrDb = defaultDb,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.household_id', ${householdId}, true)`);
    return work(tx);
  });
}
