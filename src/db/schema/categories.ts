import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { households } from "./households";

export const categoryGroups = sqliteTable(
  "category_groups",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon"),
    sortOrder: integer("sort_order").default(0),
    isSystem: integer("is_system", { mode: "boolean" }).default(false),
    createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  },
  (table) => [index("idx_catgroups_household").on(table.householdId)]
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => categoryGroups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon"),
    isIncome: integer("is_income", { mode: "boolean" }).default(false),
    isSystem: integer("is_system", { mode: "boolean" }).default(false),
    sortOrder: integer("sort_order").default(0),
    createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  },
  (table) => [
    index("idx_categories_household").on(table.householdId),
    index("idx_categories_group").on(table.groupId),
  ]
);

export const categoryRules = sqliteTable(
  "category_rules",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    matchField: text("match_field", { enum: ["name", "merchant"] }).default(
      "name"
    ),
    matchPattern: text("match_pattern").notNull(),
    priority: integer("priority").default(0),
    createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  },
  (table) => [
    index("idx_catrules_household").on(table.householdId, table.priority),
  ]
);
