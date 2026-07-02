import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { randomUUID } from "crypto";
import * as schema from "../../src/db/schema";
import path from "node:path";

export async function createTestDb() {
  const connectionString =
    process.env.DATABASE_URL || "postgresql://ledgr:ledgr@localhost:5432/ledgr_test";

  const schemaName = `test_${randomUUID().replace(/-/g, "")}`;

  // Create the schema with a throwaway connection first, then open the real
  // pool with search_path pinned at *connection* time. `SET search_path` only
  // affects a single connection, but a Pool hands out many connections — so
  // setting it via a query left migrate/queries resolving to `public` on any
  // fresh connection, which broke the full concurrent suite (relation-not-found).
  // The `options` startup param applies to every connection the pool opens.
  const admin = new Pool({ connectionString });
  await admin.query(`CREATE SCHEMA "${schemaName}"`);
  await admin.end();

  const pool = new Pool({
    connectionString,
    options: `-c search_path=${schemaName}`,
  });

  const db = drizzle({ client: pool, schema });
  // Track applied migrations *inside this test schema*, not the shared default
  // `drizzle` schema. Otherwise the first test file to migrate records the
  // migrations globally and every later createTestDb() sees them as "already
  // applied" and creates no tables — the real cause of the full-suite
  // relation-not-found failures (each file passed only in isolation).
  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), "src/db/migrations"),
    migrationsSchema: schemaName,
  });

  return {
    db,
    async close() {
      await pool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
      await pool.end();
    },
  };
}
