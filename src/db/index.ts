import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";

// The app runtime connects as a restricted, non-superuser role (APP_DATABASE_URL)
// so RLS policies actually apply — DATABASE_URL (superuser/owner) is reserved for
// migrations and drizzle-kit tooling. See docs/rls-pilot.md and
// scripts/ensure-app-role.mjs. Falls back to DATABASE_URL when APP_DATABASE_URL
// isn't set (bare `pnpm dev`, or a deployment that hasn't adopted the restricted
// role yet) — RLS simply has no effect for those, same as before this existed.
const pool = new Pool({
  connectionString: process.env.APP_DATABASE_URL || process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // Applied natively by pg on each connection — avoids racing a fire-and-forget
  // `SET statement_timeout` query against the caller's first query on cold connections.
  statement_timeout: 30_000,
});

export const db = drizzle({ client: pool, schema });

// The base type both `db` and a `db.transaction(tx => ...)` callback's `tx`
// satisfy (PgTransaction extends PgDatabase). Kept as the shared type for
// every `db: LedgrDb = defaultDb` param in the codebase specifically so a
// withHousehold()-bound tx can be passed anywhere a plain db currently is —
// see src/lib/household-context.ts. Deliberately excludes `$client` (unique
// to the pool-backed instance, unused anywhere in src/ — grep before adding
// a call site that needs it back).
export type LedgrDb = PgDatabase<NodePgQueryResultHKT, typeof schema>;
