import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts";
import { households } from "./households";
import { merchants } from "./merchants";
import { categories } from "./categories";
import { recurringTransactions } from "./recurring";

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    plaidTransactionId: text("plaid_transaction_id"),
    pendingTransactionId: text("pending_transaction_id"),
    merchantId: text("merchant_id").references(() => merchants.id),
    categoryId: text("category_id").references(() => categories.id),
    recurringTransactionId: text("recurring_transaction_id").references(() => recurringTransactions.id),
    transferPairId: text("transfer_pair_id"),
    date: text("date").notNull(),
    originalName: text("original_name").notNull(),
    name: text("name").notNull(),
    amount: integer("amount").notNull(),
    normalizedAmount: integer("normalized_amount").notNull(),
    currency: text("currency").default("USD"),
    pending: integer("pending", { mode: "boolean" }).default(false),
    reviewed: integer("reviewed", { mode: "boolean" }).default(false),
    notes: text("notes"),
    tags: text("tags"),
    isTransfer: integer("is_transfer", { mode: "boolean" }).default(false),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
    updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  },
  (table) => [
    index("idx_txn_account_date").on(table.accountId, table.date),
    index("idx_txn_category_date").on(table.categoryId, table.date),
    index("idx_txn_household_date").on(table.householdId, table.date),
    index("idx_txn_date").on(table.date),
    uniqueIndex("idx_txn_plaid_id_unique").on(table.plaidTransactionId),
    index("idx_txn_merchant").on(table.merchantId),
    index("idx_txn_transfer").on(table.transferPairId),
  ]
);

export const transactionSplits = sqliteTable(
  "transaction_splits",
  {
    id: text("id").primaryKey(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    amount: integer("amount").notNull(),
    notes: text("notes"),
    createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  },
  (table) => [
    index("idx_splits_txn").on(table.transactionId),
    index("idx_splits_category").on(table.categoryId),
  ]
);

export const transactionAttachments = sqliteTable(
  "transaction_attachments",
  {
    id: text("id").primaryKey(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    filePath: text("file_path").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  },
  (table) => [index("idx_attachments_txn").on(table.transactionId)]
);
