import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { households } from "./households";

export const BANK_PROVIDERS = ["plaid", "simplefin"] as const;
export type BankProvider = (typeof BANK_PROVIDERS)[number];

export type ConnectionStatus =
  | "active"
  | "error"
  | "reauth_required"
  | "revoked"
  | "pending_classification";

export const bankConnections = pgTable("bank_connections", {
  id: text("id").primaryKey(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: BANK_PROVIDERS }).notNull(),
  credential: text("credential").notNull(),
  plaidInstitutionId: text("plaid_institution_id"),
  plaidItemId: text("plaid_item_id"),
  institutionName: text("institution_name"),
  syncCursor: text("sync_cursor"),
  status: text("status", {
    enum: ["active", "error", "reauth_required", "revoked", "pending_classification"],
  }).default("active"),
  errorCode: text("error_code"),
  primaryColor: text("primary_color"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_bank_connections_household").on(table.householdId),
  index("idx_bank_connections_household_institution").on(table.householdId, table.plaidInstitutionId),
  uniqueIndex("idx_bank_connections_plaid_item_id").on(table.plaidItemId),
]);

export const syncLog = pgTable("sync_log", {
  id: text("id").primaryKey(),
  connectionId: text("connection_id")
    .notNull()
    .references(() => bankConnections.id, { onDelete: "cascade" }),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
  cursorBefore: text("cursor_before"),
  cursorAfter: text("cursor_after"),
  addedCount: integer("added_count").default(0),
  modifiedCount: integer("modified_count").default(0),
  removedCount: integer("removed_count").default(0),
  error: text("error"),
}, (table) => [
  index("idx_sync_log_connection_id").on(table.connectionId),
]);

export const institutionLogos = pgTable("institution_logos", {
  id: text("id").primaryKey(),
  connectionId: text("connection_id")
    .notNull()
    .references(() => bankConnections.id, { onDelete: "cascade" }),
  logo: text("logo").notNull(),
}, (table) => [
  uniqueIndex("idx_institution_logos_connection").on(table.connectionId),
]);
