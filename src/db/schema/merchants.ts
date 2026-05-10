import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { households } from "./households";
import { categories } from "./categories";

export const merchants = sqliteTable(
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
    createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
    updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  },
  (table) => [
    index("idx_merchants_household").on(table.householdId),
    index("idx_merchants_household_name").on(table.householdId, table.name),
  ]
);
