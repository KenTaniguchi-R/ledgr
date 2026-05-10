ALTER TABLE `recurring_transactions` ADD `account_id` text REFERENCES accounts(id);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_recurring_plaid_stream_id` ON `recurring_transactions` (`plaid_stream_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`household_id` text NOT NULL,
	`plaid_transaction_id` text,
	`pending_transaction_id` text,
	`merchant_id` text,
	`category_id` text,
	`recurring_transaction_id` text,
	`transfer_pair_id` text,
	`date` text NOT NULL,
	`original_name` text NOT NULL,
	`name` text NOT NULL,
	`amount` integer NOT NULL,
	`normalized_amount` integer NOT NULL,
	`currency` text DEFAULT 'USD',
	`pending` integer DEFAULT false,
	`reviewed` integer DEFAULT false,
	`notes` text,
	`tags` text,
	`is_transfer` integer DEFAULT false,
	`deleted_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recurring_transaction_id`) REFERENCES `recurring_transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_transactions`("id", "account_id", "household_id", "plaid_transaction_id", "pending_transaction_id", "merchant_id", "category_id", "recurring_transaction_id", "transfer_pair_id", "date", "original_name", "name", "amount", "normalized_amount", "currency", "pending", "reviewed", "notes", "tags", "is_transfer", "deleted_at", "created_at", "updated_at") SELECT "id", "account_id", "household_id", "plaid_transaction_id", "pending_transaction_id", "merchant_id", "category_id", "recurring_transaction_id", "transfer_pair_id", "date", "original_name", "name", "amount", "normalized_amount", "currency", "pending", "reviewed", "notes", "tags", "is_transfer", "deleted_at", "created_at", "updated_at" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_txn_account_date` ON `transactions` (`account_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_txn_category_date` ON `transactions` (`category_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_txn_household_date` ON `transactions` (`household_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_txn_date` ON `transactions` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_txn_plaid_id_unique` ON `transactions` (`plaid_transaction_id`);--> statement-breakpoint
CREATE INDEX `idx_txn_merchant` ON `transactions` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `idx_txn_transfer` ON `transactions` (`transfer_pair_id`);