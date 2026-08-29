import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { randomUUID } from "crypto";
import * as schema from "../../src/db/schema";
import path from "node:path";

export async function createTestDb() {
  const connectionString =
    process.env.DATABASE_URL || "postgresql://ledgr:ledgr@localhost:5432/ledgr_test";

  const dbName = `test_${randomUUID().replace(/-/g, "")}`;

  // Isolate each test file in its own *database* (not a schema). Migrations
  // reference tables as `"public"."<table>"`, which only resolves when the
  // objects live in the public schema — a per-schema/search_path approach breaks
  // on those qualified references. A throwaway database per file gives every test
  // its own public schema, keeps the concurrent suite isolated, and is robust to
  // future migrations regardless of how they qualify identifiers.
  const admin = new Pool({ connectionString });
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const url = new URL(connectionString);
  url.pathname = `/${dbName}`;

  const pool = new Pool({ connectionString: url.toString() });
  const db = drizzle({ client: pool, schema });
  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), "src/db/migrations"),
  });

  return {
    db,
    async close() {
      await pool.end();
      // DROP DATABASE cannot run while connections are open; FORCE terminates any
      // stragglers (Postgres 13+).
      const admin2 = new Pool({ connectionString });
      await admin2.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      await admin2.end();
    },
  };
}
