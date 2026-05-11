import { index, integer, pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { households } from "./households";

export const categoryGroups = pgTable(
  "category_groups",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon"),
    sortOrder: integer("sort_order").default(0),
    isSystem: boolean("is_system").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_catgroups_household").on(table.householdId)]
);

export const categories = pgTable(
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
    isIncome: boolean("is_income").default(false),
    isSystem: boolean("is_system").default(false),
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_categories_household").on(table.householdId),
    index("idx_categories_group").on(table.groupId),
  ]
);

export const categoryRules = pgTable(
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_catrules_household").on(table.householdId, table.priority),
  ]
);
