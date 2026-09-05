import { index, integer, pgTable, pgPolicy, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts";
import { households } from "./households";
import { merchants } from "./merchants";
import { categories } from "./categories";
import { recurringTransactions } from "./recurring";

export const CATEGORY_SOURCES = ["rule", "merchant_default", "pfc", "ai", "manual"] as const;
export type CategorySource = (typeof CATEGORY_SOURCES)[number];

export const transactions = pgTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    pendingTransactionId: text("pending_transaction_id"),
    merchantId: text("merchant_id").references(() => merchants.id, {
      onDelete: "set null",
    }),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    recurringTransactionId: text("recurring_transaction_id").references(
      () => recurringTransactions.id,
      { onDelete: "set null" },
    ),
    transferPairId: text("transfer_pair_id"),
    date: text("date").notNull(),
    originalName: text("original_name").notNull(),
    name: text("name").notNull(),
    amount: integer("amount").notNull(),
    normalizedAmount: integer("normalized_amount").notNull(),
    currency: text("currency").default("USD"),
    pending: boolean("pending").default(false),
    reviewed: boolean("reviewed").default(false),
    notes: text("notes"),
    tags: text("tags"),
    isTransfer: boolean("is_transfer").default(false),
    // Provenance for isTransfer/transferPairId, mirroring categorySource:
    // manual and manual_rejected are user decisions and must never be
    // overwritten by the lower tiers (pfc at ingestion, auto/pattern
    // detection). `pattern` is a single-leg, high-confidence name/memo match
    // (e.g. a credit-card payoff memo) — trusted immediately like `auto`, but
    // tagged separately since it never has a transferPairId. `suggested` is a
    // single-leg, low-confidence match (e.g. a bare P2P processor name) —
    // isTransfer stays false until a human confirms via the review queue, so
    // it keeps counting toward spend/income until then.
    transferSource: text("transfer_source", {
      enum: ["pfc", "auto", "pattern", "suggested", "manual", "manual_rejected"],
    }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    externalId: text("external_id"),
    provider: text("provider", { enum: ["plaid", "simplefin", "csv", "manual"] }),
    aiCategorizationAttemptedAt: timestamp("ai_categorization_attempted_at", { withTimezone: true }),
    merchantResolutionAttemptedAt: timestamp("merchant_resolution_attempted_at", { withTimezone: true }),
    pfcPrimary: text("pfc_primary"),
    pfcDetailed: text("pfc_detailed"),
    categorySource: text("category_source"),
  },
  (table) => [
    index("idx_txn_account_date").on(table.accountId, table.date),
    index("idx_txn_category_date").on(table.categoryId, table.date),
    index("idx_txn_household_date").on(table.householdId, table.date),
    index("idx_txn_date").on(table.date),
    index("idx_txn_merchant").on(table.merchantId),
    index("idx_txn_household_merchant_resolution").on(table.householdId, table.merchantId, table.merchantResolutionAttemptedAt),
    index("idx_txn_transfer").on(table.transferPairId),
    uniqueIndex("idx_txn_external_id")
      .on(table.accountId, table.externalId)
      .where(sql`external_id IS NOT NULL`),
    index("idx_txn_household_reviewed_date").on(table.householdId, table.reviewed, table.date),
    index("idx_txn_household_transfer_date").on(table.householdId, table.isTransfer, table.date),
    index("idx_txn_household_date_id").on(table.householdId, table.date, table.id),
    // RLS PILOT — every call site touching `transactions` now runs inside
    // withHousehold() (src/lib/household-context.ts), which sets
    // app.household_id per this policy's requirement. Still not load-bearing
    // in a default deployment, though: this policy only has effect for a
    // non-superuser, non-BYPASSRLS connection, and the app currently connects
    // as the POSTGRES_USER role, which the official postgres image grants
    // superuser. See docs/rls-pilot.md for the remaining role-separation step.
    pgPolicy("household_isolation", {
      for: "all",
      using: sql`household_id = current_setting('app.household_id', true)`,
      withCheck: sql`household_id = current_setting('app.household_id', true)`,
    }),
  ]
).enableRLS();

export const transactionSplits = pgTable(
  "transaction_splits",
  {
    id: text("id").primaryKey(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_splits_txn").on(table.transactionId),
    index("idx_splits_category").on(table.categoryId),
  ]
);
