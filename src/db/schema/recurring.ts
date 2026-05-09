import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { households } from "./households";
import { merchants } from "./merchants";
import { categories } from "./categories";

export const recurringTransactions = sqliteTable(
  "recurring_transactions",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    plaidStreamId: text("plaid_stream_id"),
    name: text("name").notNull(),
    merchantId: text("merchant_id").references(() => merchants.id),
    categoryId: text("category_id").references(() => categories.id),
    averageAmount: integer("average_amount"),
    lastAmount: integer("last_amount"),
    frequency: text("frequency", {
      enum: ["weekly", "biweekly", "semimonthly", "monthly", "yearly"],
    }),
    lastDate: text("last_date"),
    nextDate: text("next_date"),
    isActive: integer("is_active", { mode: "boolean" }).default(true),
    isIncome: integer("is_income", { mode: "boolean" }).default(false),
    createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
    updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  },
  (table) => [
    index("idx_recurring_household").on(table.householdId),
    index("idx_recurring_next").on(table.nextDate),
  ]
);
