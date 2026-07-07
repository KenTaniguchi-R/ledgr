import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // Applied natively by pg on each connection — avoids racing a fire-and-forget
  // `SET statement_timeout` query against the caller's first query on cold connections.
  statement_timeout: 30_000,
});

export const db = drizzle({ client: pool, schema });
export type LedgrDb = typeof db;
