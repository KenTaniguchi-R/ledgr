import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { randomUUID } from "crypto";
import * as schema from "../../src/db/schema";
import path from "node:path";

// Each worker holds a pool for the life of its test file. Left at pg's default
// of 10 these overrun the server's connection limit once vitest scales forks to
// the core count; the suite needs only a couple of concurrent queries per file.
const POOL_MAX = 4;

// CREATE DATABASE ... TEMPLATE briefly conflicts when several workers clone the
// same template at once (55006). It clears on its own, so retry rather than
// serialize every worker behind a lock.
const CLONE_RETRIES = 10;

async function cloneTemplate(admin: Pool, dbName: string, template: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      await admin.query(`CREATE DATABASE "${dbName}" TEMPLATE "${template}"`);
      return;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "55006" || attempt >= CLONE_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}

export async function createTestDb() {
  const connectionString =
    process.env.DATABASE_URL || "postgresql://ledgr:ledgr@localhost:5432/ledgr_test";

  const dbName = `test_${randomUUID().replace(/-/g, "")}`;
  const template = process.env.TEST_TEMPLATE_DB;

  // Isolate each test file in its own *database* (not a schema). Migrations
  // reference tables as `"public"."<table>"`, which only resolves when the
  // objects live in the public schema — a per-schema/search_path approach breaks
  // on those qualified references. A throwaway database per file gives every test
  // its own public schema, keeps the concurrent suite isolated, and is robust to
  // future migrations regardless of how they qualify identifiers.
  const admin = new Pool({ connectionString, max: 1 });
  if (template) {
    await cloneTemplate(admin, dbName, template);
  } else {
    await admin.query(`CREATE DATABASE "${dbName}"`);
  }
  await admin.end();

  const url = new URL(connectionString);
  url.pathname = `/${dbName}`;

  const pool = new Pool({ connectionString: url.toString(), max: POOL_MAX });
  const db = drizzle({ client: pool, schema });

  // The template arrives already migrated. Without one (a direct DATABASE_URL,
  // no global setup) fall back to replaying the chain.
  if (!template) {
    await migrate(db, {
      migrationsFolder: path.join(process.cwd(), "src/db/migrations"),
    });
  }

  return {
    db,
    async close() {
      await pool.end();
      // DROP DATABASE cannot run while connections are open; FORCE terminates any
      // stragglers (Postgres 13+).
      const admin2 = new Pool({ connectionString, max: 1 });
      await admin2.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      await admin2.end();
    },
  };
}
