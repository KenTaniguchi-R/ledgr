import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts";

export const investmentHoldings = sqliteTable(
  "investment_holdings",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    plaidSecurityId: text("plaid_security_id"),
    securityName: text("security_name").notNull(),
    ticker: text("ticker"),
    quantity: real("quantity"),
    costBasis: integer("cost_basis"),
    currentValue: integer("current_value"),
    type: text("type", {
      enum: ["stock", "etf", "mutual_fund", "bond", "crypto", "cash", "other"],
    }),
    sector: text("sector"),
    currency: text("currency").default("USD"),
    asOfDate: text("as_of_date").notNull(),
    createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
    updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  },
  (table) => [
    index("idx_holdings_account").on(table.accountId),
    index("idx_holdings_date").on(table.accountId, table.asOfDate),
    index("idx_holdings_security").on(table.plaidSecurityId),
  ]
);

export const holdingsHistory = sqliteTable(
  "holdings_history",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    plaidSecurityId: text("plaid_security_id"),
    securityName: text("security_name"),
    ticker: text("ticker"),
    quantity: real("quantity"),
    value: integer("value"),
    date: text("date").notNull(),
    createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  },
  (table) => [
    index("idx_holdingshistory_account_date").on(table.accountId, table.date),
    index("idx_holdingshistory_security").on(table.plaidSecurityId, table.date),
    uniqueIndex("uq_holdingshistory_account_security_date").on(
      table.accountId,
      table.plaidSecurityId,
      table.date,
    ),
  ]
);

export const investmentTransactions = sqliteTable(
  "investment_transactions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    plaidInvestmentTransactionId: text("plaid_investment_transaction_id"),
    securityName: text("security_name"),
    ticker: text("ticker"),
    type: text("type", {
      enum: ["buy", "sell", "dividend", "transfer", "fee", "other"],
    }),
    quantity: real("quantity"),
    price: integer("price"),
    amount: integer("amount").notNull(),
    fees: integer("fees").default(0),
    date: text("date").notNull(),
    createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  },
  (table) => [
    index("idx_invtxn_account_date").on(table.accountId, table.date),
    uniqueIndex("uq_invtxn_plaid_id").on(table.plaidInvestmentTransactionId),
  ]
);
