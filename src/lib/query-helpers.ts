import { isNull } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

export function notDeleted(table: { deletedAt: SQLiteColumn }) {
  return isNull(table.deletedAt);
}
