import {
  index,
  integer,
  pgTable,
  text,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { households } from "./households";
import { plaidItems } from "./plaid";

export const ACCOUNT_TYPES = ["checking", "savings", "credit", "loan", "investment", "other"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    plaidItemId: text("plaid_item_id").references(() => plaidItems.id, {
      onDelete: "set null",
    }),
    plaidAccountId: text("plaid_account_id"),
    name: text("name").notNull(),
    officialName: text("official_name"),
    type: text("type", { enum: ACCOUNT_TYPES }).notNull(),
    subtype: text("subtype"),
    currentBalance: integer("current_balance"),
    availableBalance: integer("available_balance"),
    creditLimit: integer("credit_limit"),
    currency: text("currency").default("USD"),
    isManual: boolean("is_manual").default(false),
    isHidden: boolean("is_hidden").default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_accounts_household").on(table.householdId),
    index("idx_accounts_plaid_item").on(table.plaidItemId),
    index("idx_accounts_resurrection")
      .on(table.plaidAccountId, table.householdId)
      .where(sql`deleted_at IS NOT NULL`),
  ]
);

export const balanceHistory = pgTable(
  "balance_history",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    balance: integer("balance").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_balance_account_date").on(table.accountId, table.date),
    index("idx_balance_history_account_date").on(table.accountId, table.date),
  ]
);
