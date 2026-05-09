import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { households } from "./households";
import { accounts } from "./accounts";

export const goals = sqliteTable(
  "goals",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    targetAmount: integer("target_amount").notNull(),
    targetDate: text("target_date"),
    linkedAccountId: text("linked_account_id").references(() => accounts.id),
    icon: text("icon"),
    color: text("color"),
    isCompleted: integer("is_completed", { mode: "boolean" }).default(false),
    createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
    updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  },
  (table) => [index("idx_goals_household").on(table.householdId)]
);
