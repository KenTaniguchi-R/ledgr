import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  console.error("Set it in your .env file. See .env.example for reference.");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3_000;

for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10_000,
  });

  try {
    const db = drizzle({ client: pool });
    await migrate(db, { migrationsFolder: __dirname });
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
