import { index, integer, pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    billReminders: boolean("bill_reminders").default(true),
    overBudget: boolean("over_budget").default(true),
    largeTransactions: boolean("large_transactions").default(true),
    largeTxnThreshold: integer("large_txn_threshold").default(50000),
    weeklySummary: boolean("weekly_summary").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  }
);

export const savedFilters = pgTable(
  "saved_filters",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    filterConfig: text("filter_config").notNull(),
    isPinned: boolean("is_pinned").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_savedfilters_user").on(table.userId)]
);
