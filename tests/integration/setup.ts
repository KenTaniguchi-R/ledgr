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
  const pool = new Pool({ connectionString, max: 1 });

  await pool.query(`CREATE SCHEMA "${schemaName}"`);
  await pool.query(`SET search_path TO "${schemaName}"`);

  const db = drizzle({ client: pool, schema });
  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), "src/db/migrations"),
  });

  return {
    db,
    async close() {
      await pool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
      await pool.end();
    },
  };
}
