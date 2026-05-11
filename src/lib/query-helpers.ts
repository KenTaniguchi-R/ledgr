import { isNull, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

export function notDeleted(table: { deletedAt: PgColumn }) {
  return isNull(table.deletedAt);
}

export function sumAbs(col: PgColumn) {
  return sql<number>`COALESCE(SUM(ABS(${col})), 0)`.mapWith(Number);
}

export function sumCol(col: PgColumn) {
  return sql<number>`COALESCE(SUM(${col}), 0)`.mapWith(Number);
}

export function countRows() {
  return sql<number>`count(*)`.mapWith(Number);
}

export function encodeCursor(date: string, id: string): string {
  return Buffer.from(JSON.stringify({ date, id })).toString("base64");
}

export function decodeCursor(cursor: string): { date: string; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64").toString());
    if (typeof parsed.date === "string" && typeof parsed.id === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
