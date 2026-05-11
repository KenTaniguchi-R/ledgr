import { index, integer, pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { households } from "./households";
import { accounts } from "./accounts";

export const goals = pgTable(
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
    isCompleted: boolean("is_completed").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_goals_household").on(table.householdId)]
);
