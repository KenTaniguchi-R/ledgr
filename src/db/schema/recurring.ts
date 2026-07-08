import { index, integer, pgTable, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { households } from "./households";
import { accounts } from "./accounts";
import { merchants } from "./merchants";
import { categories } from "./categories";

export const recurringTransactions = pgTable(
  "recurring_transactions",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    plaidStreamId: text("plaid_stream_id"),
    accountId: text("account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    merchantId: text("merchant_id").references(() => merchants.id, {
      onDelete: "set null",
    }),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    averageAmount: integer("average_amount"),
    lastAmount: integer("last_amount"),
    frequency: text("frequency", {
      enum: ["weekly", "biweekly", "semimonthly", "monthly", "yearly"],
    }),
    lastDate: text("last_date"),
    nextDate: text("next_date"),
    isActive: boolean("is_active").default(true),
    isIncome: boolean("is_income").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_recurring_household").on(table.householdId),
    index("idx_recurring_next").on(table.nextDate),
    uniqueIndex("idx_recurring_plaid_stream_id").on(table.plaidStreamId),
  ]
);
