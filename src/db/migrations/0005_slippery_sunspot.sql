ALTER TABLE "plaid_items" RENAME TO "bank_connections";--> statement-breakpoint
ALTER TABLE "bank_connections" RENAME COLUMN "access_token" TO "credential";--> statement-breakpoint
ALTER TABLE "bank_connections" ADD COLUMN "provider" text;--> statement-breakpoint
UPDATE "bank_connections" SET "provider" = 'plaid' WHERE "provider" IS NULL;--> statement-breakpoint
ALTER TABLE "bank_connections" ALTER COLUMN "provider" SET NOT NULL;--> statement-breakpoint
ALTER INDEX "idx_plaid_items_household" RENAME TO "idx_bank_connections_household";--> statement-breakpoint
ALTER INDEX "idx_plaid_items_household_institution" RENAME TO "idx_bank_connections_household_institution";--> statement-breakpoint
ALTER INDEX "idx_plaid_items_plaid_item_id" RENAME TO "idx_bank_connections_plaid_item_id";--> statement-breakpoint
ALTER TABLE "bank_connections" RENAME CONSTRAINT "plaid_items_household_id_households_id_fk" TO "bank_connections_household_id_households_id_fk";--> statement-breakpoint
ALTER TABLE "accounts" RENAME COLUMN "plaid_item_id" TO "bank_connection_id";--> statement-breakpoint
ALTER TABLE "accounts" RENAME COLUMN "plaid_account_id" TO "external_account_id";--> statement-breakpoint
ALTER INDEX "idx_accounts_plaid_item" RENAME TO "idx_accounts_bank_connection";--> statement-breakpoint
ALTER TABLE "accounts" RENAME CONSTRAINT "accounts_plaid_item_id_plaid_items_id_fk" TO "accounts_bank_connection_id_bank_connections_id_fk";--> statement-breakpoint
ALTER TABLE "sync_log" RENAME COLUMN "plaid_item_id" TO "connection_id";--> statement-breakpoint
ALTER INDEX "idx_sync_log_plaid_item_id" RENAME TO "idx_sync_log_connection_id";--> statement-breakpoint
ALTER TABLE "sync_log" RENAME CONSTRAINT "sync_log_plaid_item_id_plaid_items_id_fk" TO "sync_log_connection_id_bank_connections_id_fk";--> statement-breakpoint
ALTER TABLE "institution_logos" RENAME COLUMN "plaid_item_id" TO "connection_id";--> statement-breakpoint
ALTER INDEX "idx_institution_logos_plaid_item" RENAME TO "idx_institution_logos_connection";--> statement-breakpoint
ALTER TABLE "institution_logos" RENAME CONSTRAINT "institution_logos_plaid_item_id_plaid_items_id_fk" TO "institution_logos_connection_id_bank_connections_id_fk";--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "provider" text;--> statement-breakpoint
UPDATE "transactions" SET "external_id" = "plaid_transaction_id", "provider" = 'plaid' WHERE "plaid_transaction_id" IS NOT NULL;--> statement-breakpoint
DROP INDEX "idx_txn_plaid_id_unique";--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "plaid_transaction_id";--> statement-breakpoint
DROP INDEX "idx_txn_external_id";--> statement-breakpoint
CREATE UNIQUE INDEX "idx_txn_external_id" ON "transactions" USING btree ("account_id","external_id") WHERE "transactions"."external_id" IS NOT NULL;
