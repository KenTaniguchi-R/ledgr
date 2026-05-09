import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { households } from "./households";

export const plaidItems = sqliteTable("plaid_items", {
  id: text("id").primaryKey(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  plaidInstitutionId: text("plaid_institution_id"),
  institutionName: text("institution_name"),
  syncCursor: text("sync_cursor"),
  status: text("status", {
    enum: ["active", "error", "reauth_required"],
  }).default("active"),
  errorCode: text("error_code"),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
});

export const syncLog = sqliteTable("sync_log", {
  id: text("id").primaryKey(),
  plaidItemId: text("plaid_item_id")
    .notNull()
    .references(() => plaidItems.id, { onDelete: "cascade" }),
  syncedAt: text("synced_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  cursorBefore: text("cursor_before"),
  cursorAfter: text("cursor_after"),
  addedCount: integer("added_count").default(0),
  modifiedCount: integer("modified_count").default(0),
  removedCount: integer("removed_count").default(0),
  error: text("error"),
});
