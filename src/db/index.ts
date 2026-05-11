import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("connect", (client) => {
  client.query("SET statement_timeout = '30s'");
});

export const db = drizzle({ client: pool, schema });
export type LedgrDb = typeof db;
