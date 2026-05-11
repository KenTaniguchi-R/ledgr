import {
  index,
  integer,
  pgTable,
  text,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { households } from "./households";
import { categories } from "./categories";

export const budgets = pgTable(
  "budgets",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    type: text("type", { enum: ["category", "flex"] }).default("category"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_budget_household_month").on(
      table.householdId,
      table.month
    ),
  ]
);

export const budgetCategories = pgTable(
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
    rollover: boolean("rollover").default(false),
    isFixed: boolean("is_fixed").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_budgetcat_budget_category").on(
      table.budgetId,
      table.categoryId
    ),
    index("idx_budgetcat_budget").on(table.budgetId),
  ]
);
