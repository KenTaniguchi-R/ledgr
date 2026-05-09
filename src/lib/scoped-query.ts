import { eq, and, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as defaultDb } from "@/db";
import type * as schema from "@/db/schema";

type LedgrDb = BetterSQLite3Database<typeof schema>;

export function scopedQuery(householdId: string, db: LedgrDb = defaultDb) {
  return {
    db,
    householdId,
    where<T extends { householdId: SQLiteColumn }>(
      table: T,
      ...conditions: (SQL | undefined)[]
    ) {
      const filtered = conditions.filter((c): c is SQL => c !== undefined);
      return filtered.length > 0
        ? and(eq(table.householdId, householdId), ...filtered)
        : eq(table.householdId, householdId);
    },
  };
}
