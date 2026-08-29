import { sql } from "drizzle-orm";
import type { LedgrDb } from "@/db";

/**
 * Guards the operator backfill jobs, which enumerate every household rather
 * than working inside a single withHousehold() scope.
 *
 * The RLS policies fail closed: with no `app.household_id` set, a restricted
 * role sees zero rows. Today only `transactions` has RLS enabled, so these
 * jobs work — but the documented plan (docs/rls-pilot.md) is to extend it to
 * the remaining household-scoped tables. The day `households` is covered,
 * these jobs would quietly iterate nothing and report success, which looks
 * exactly like "there was nothing to do". Fail loudly instead.
 */
export async function assertCanEnumerateHouseholds(db: LedgrDb): Promise<void> {
  // to_regclass respects search_path, so this resolves correctly under the
  // per-file schemas the integration tests run in.
  const result = await db.execute(sql`
    SELECT c.relrowsecurity AS rls_enabled,
           COALESCE((SELECT r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user), false) AS bypasses_rls
    FROM pg_class c
    WHERE c.oid = to_regclass('households')
  `);

  const row = (result.rows ?? result)[0] as
    | { rls_enabled: boolean; bypasses_rls: boolean }
    | undefined;
  if (!row) return; // No such table — let the caller's own query surface it.

  if (row.rls_enabled && !row.bypasses_rls) {
    throw new Error(
      "Cannot enumerate households: row-level security is enabled on `households` and the " +
        "current role does not bypass it, so this job would silently process zero households " +
        "and report success. Run it with the admin DATABASE_URL rather than APP_DATABASE_URL " +
        "(see docs/rls-pilot.md).",
    );
  }
}
