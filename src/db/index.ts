import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import * as schema from "./schema";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

export type LedgrDb = BetterSQLite3Database<typeof schema>;

const dbPath =
  process.env.DATABASE_PATH || path.join(process.cwd(), "data", "ledgr.db");

const sqlite = new Database(dbPath);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("synchronous = NORMAL");

export const db = drizzle(sqlite, { schema });
