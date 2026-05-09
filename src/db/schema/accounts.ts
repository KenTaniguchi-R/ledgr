import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { households } from "./households";
import { plaidItems } from "./plaid";

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    plaidItemId: text("plaid_item_id").references(() => plaidItems.id),
    plaidAccountId: text("plaid_account_id"),
    name: text("name").notNull(),
    officialName: text("official_name"),
    type: text("type", {
      enum: ["checking", "savings", "credit", "loan", "investment", "other"],
    }).notNull(),
    subtype: text("subtype"),
    currentBalance: integer("current_balance"),
    availableBalance: integer("available_balance"),
    creditLimit: integer("credit_limit"),
    currency: text("currency").default("USD"),
    isManual: integer("is_manual", { mode: "boolean" }).default(false),
    isHidden: integer("is_hidden", { mode: "boolean" }).default(false),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
    updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  },
  (table) => [
    index("idx_accounts_household").on(table.householdId),
    index("idx_accounts_plaid_item").on(table.plaidItemId),
  ]
);

export const balanceHistory = sqliteTable(
  "balance_history",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    balance: integer("balance").notNull(),
    createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  },
  (table) => [
    uniqueIndex("uq_balance_account_date").on(table.accountId, table.date),
    index("idx_balance_history_account_date").on(table.accountId, table.date),
  ]
);
