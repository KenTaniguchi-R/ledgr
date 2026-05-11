import { isNull } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

export function notDeleted(table: { deletedAt: PgColumn }) {
  return isNull(table.deletedAt);
}
