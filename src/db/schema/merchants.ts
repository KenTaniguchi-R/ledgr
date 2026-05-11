import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { households } from "./households";
import { categories } from "./categories";

export const merchants = pgTable(
  "merchants",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    rawNames: text("raw_names"),
    logoUrl: text("logo_url"),
    categoryId: text("category_id").references(() => categories.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_merchants_household").on(table.householdId),
    index("idx_merchants_household_name").on(table.householdId, table.name),
  ]
);
