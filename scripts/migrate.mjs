import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  console.error("Set it in your .env file. See .env.example for reference.");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3_000;

/**
 * drizzle-kit decides what to apply by comparing each journal entry's `when`
 * against the newest `created_at` already recorded. One entry with a
 * out-of-order (e.g. future) timestamp therefore makes every later migration
 * look already-applied, and they are skipped *while the run reports success* —
 * the schema silently drifts behind the code. Comparing counts catches that.
 */
async function assertNoSilentDrift(db) {
  const journal = JSON.parse(readFileSync(join(__dirname, "meta", "_journal.json"), "utf8"));
  const expected = journal.entries.length;

  const result = await db.execute(
    sql`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`,
  );
  const applied = Number((result.rows ?? result)[0].count);

  if (applied < expected) {
    throw new Error(
      `Migration drift: ${applied} of ${expected} migrations are recorded as applied, ` +
        `but the run reported success. This usually means a journal entry carries an ` +
        `out-of-order timestamp, causing drizzle-kit to skip later migrations silently. ` +
        `Compare src/db/migrations/meta/_journal.json against drizzle.__drizzle_migrations.`,
    );
  }
}

for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10_000,
  });

  try {
    const db = drizzle({ client: pool });
    await migrate(db, { migrationsFolder: __dirname });

    // Drift is a deterministic bug in the journal, never a transient fault —
    // fail immediately instead of burning the retry budget on it.
    try {
      await assertNoSilentDrift(db);
    } catch (driftErr) {
      console.error(driftErr.message);
      await pool.end();
      process.exit(1);
    }

    console.log("Migrations complete");
    await pool.end();
    process.exit(0);
  } catch (err) {
    await pool.end();
    if (attempt === MAX_RETRIES) {
      console.error(`Migration failed after ${MAX_RETRIES} attempts:`, err.message);
      process.exit(1);
    }
    console.error(`Migration attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
    console.error(`Retrying in ${RETRY_DELAY_MS / 1000}s...`);
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }
}
