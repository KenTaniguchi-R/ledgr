import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const notificationPreferences = sqliteTable(
  "notification_preferences",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    billReminders: integer("bill_reminders", { mode: "boolean" }).default(true),
    overBudget: integer("over_budget", { mode: "boolean" }).default(true),
    largeTransactions: integer("large_transactions", {
      mode: "boolean",
    }).default(true),
    largeTxnThreshold: integer("large_txn_threshold").default(50000),
    weeklySummary: integer("weekly_summary", { mode: "boolean" }).default(
      false
    ),
    createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
    updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  }
);

export const savedFilters = sqliteTable(
  "saved_filters",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    filterConfig: text("filter_config").notNull(),
    isPinned: integer("is_pinned", { mode: "boolean" }).default(false),
    createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
    updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  },
  (table) => [index("idx_savedfilters_user").on(table.userId)]
);
