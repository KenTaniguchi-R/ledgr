DROP INDEX `idx_txn_plaid_id`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_txn_plaid_id_unique` ON `transactions` (`plaid_transaction_id`);--> statement-breakpoint
CREATE INDEX `idx_plaid_items_household` ON `plaid_items` (`household_id`);--> statement-breakpoint
CREATE INDEX `idx_plaid_items_household_institution` ON `plaid_items` (`household_id`,`plaid_institution_id`);--> statement-breakpoint
CREATE INDEX `idx_sync_log_plaid_item_id` ON `sync_log` (`plaid_item_id`);--> statement-breakpoint
CREATE INDEX `idx_merchants_household_name` ON `merchants` (`household_id`,`name`);