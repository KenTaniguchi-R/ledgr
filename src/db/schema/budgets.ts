import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { households } from "./households";
import { categories } from "./categories";

export const budgets = sqliteTable(
  "budgets",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    type: text("type", { enum: ["category", "flex"] }).default("category"),
    createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
    updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  },
  (table) => [
    uniqueIndex("uq_budget_household_month").on(
      table.householdId,
      table.month
    ),
  ]
);

export const budgetCategories = sqliteTable(
  "budget_categories",
  {
    id: text("id").primaryKey(),
    budgetId: text("budget_id")
      .notNull()
      .references(() => budgets.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    limitAmount: integer("limit_amount").notNull(),
    rollover: integer("rollover", { mode: "boolean" }).default(false),
    isFixed: integer("is_fixed", { mode: "boolean" }).default(false),
    createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  },
  (table) => [
    uniqueIndex("uq_budgetcat_budget_category").on(
      table.budgetId,
      table.categoryId
    ),
    index("idx_budgetcat_budget").on(table.budgetId),
  ]
);
