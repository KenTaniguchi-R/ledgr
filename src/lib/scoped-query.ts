import { eq, and, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db as defaultDb, type LedgrDb } from "@/db";

export function scopedQuery(householdId: string, db: LedgrDb = defaultDb) {
  return {
    db,
    householdId,
    where<T extends { householdId: PgColumn }>(
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
