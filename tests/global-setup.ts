import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import path from "node:path";

let container: StartedPostgreSqlContainer;

// Every test file clones this database instead of replaying the migration
// chain itself. Shared with tests/integration/setup.ts via TEST_TEMPLATE_DB.
const TEMPLATE_DB = "ledgr_test_template";

export async function setup() {
  container = await new PostgreSqlContainer("postgres:17-alpine")
    .withCommand([
      "postgres",
      // One throwaway database per test file, all on this single server. The
      // default max_connections (100) sits below what the fork pool can demand
      // — 14 workers holding a pool each exhausts it, and Postgres starts
      // terminating connections mid-run (57P01).
      "-c",
      "max_connections=300",
      // Durability buys nothing for a server destroyed at teardown.
      "-c",
      "fsync=off",
      "-c",
      "synchronous_commit=off",
      "-c",
      "full_page_writes=off",
    ])
    .start();

  const connectionString = container.getConnectionUri();
  process.env.DATABASE_URL = connectionString;
  process.env.TEST_TEMPLATE_DB = TEMPLATE_DB;

  // Migrate once, here, into a template database. Cloning that template per
  // test file replaces one full migration run per file with a file copy.
  const admin = new Pool({ connectionString, max: 1 });
  await admin.query(`CREATE DATABASE "${TEMPLATE_DB}"`);
  await admin.end();

  const templateUrl = new URL(connectionString);
  templateUrl.pathname = `/${TEMPLATE_DB}`;
  const pool = new Pool({ connectionString: templateUrl.toString(), max: 1 });
  try {
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: path.join(process.cwd(), "src/db/migrations"),
    });
  } finally {
    // The template must have no open connections, or CREATE DATABASE ...
    // TEMPLATE fails with 55006 for every test file that follows.
    await pool.end();
  }
}

export async function teardown() {
  await container?.stop();
}
