CREATE TABLE `household_members` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_household_user` ON `household_members` (`household_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `households` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`theme` text DEFAULT 'system',
	`currency` text DEFAULT 'USD',
	`ai_provider` text,
	`ai_model` text,
	`ai_api_key` text,
	`dashboard_layout` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plaid_items` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`access_token` text NOT NULL,
	`plaid_institution_id` text,
	`institution_name` text,
	`sync_cursor` text,
	`status` text DEFAULT 'active',
	`error_code` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_log` (
	`id` text PRIMARY KEY NOT NULL,
	`plaid_item_id` text NOT NULL,
	`synced_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`cursor_before` text,
	`cursor_after` text,
	`added_count` integer DEFAULT 0,
	`modified_count` integer DEFAULT 0,
	`removed_count` integer DEFAULT 0,
	`error` text,
	FOREIGN KEY (`plaid_item_id`) REFERENCES `plaid_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`plaid_item_id` text,
	`plaid_account_id` text,
	`name` text NOT NULL,
	`official_name` text,
	`type` text NOT NULL,
	`subtype` text,
	`current_balance` integer,
	`available_balance` integer,
	`credit_limit` integer,
	`currency` text DEFAULT 'USD',
	`is_manual` integer DEFAULT false,
	`is_hidden` integer DEFAULT false,
	`deleted_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plaid_item_id`) REFERENCES `plaid_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_accounts_household` ON `accounts` (`household_id`);--> statement-breakpoint
CREATE INDEX `idx_accounts_plaid_item` ON `accounts` (`plaid_item_id`);--> statement-breakpoint
CREATE TABLE `balance_history` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`balance` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_balance_account_date` ON `balance_history` (`account_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_balance_history_account_date` ON `balance_history` (`account_id`,`date`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`group_id` text NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`is_income` integer DEFAULT false,
	`is_system` integer DEFAULT false,
	`sort_order` integer DEFAULT 0,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `category_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_categories_household` ON `categories` (`household_id`);--> statement-breakpoint
CREATE INDEX `idx_categories_group` ON `categories` (`group_id`);--> statement-breakpoint
CREATE TABLE `category_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`sort_order` integer DEFAULT 0,
	`is_system` integer DEFAULT false,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_catgroups_household` ON `category_groups` (`household_id`);--> statement-breakpoint
CREATE TABLE `category_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`category_id` text NOT NULL,
	`match_field` text DEFAULT 'name',
	`match_pattern` text NOT NULL,
	`priority` integer DEFAULT 0,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_catrules_household` ON `category_rules` (`household_id`,`priority`);--> statement-breakpoint
CREATE TABLE `merchants` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`raw_names` text,
	`logo_url` text,
	`category_id` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_merchants_household` ON `merchants` (`household_id`);--> statement-breakpoint
CREATE TABLE `transaction_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`filename` text NOT NULL,
	`file_path` text NOT NULL,
	`mime_type` text,
	`size_bytes` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_attachments_txn` ON `transaction_attachments` (`transaction_id`);--> statement-breakpoint
CREATE TABLE `transaction_splits` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`category_id` text NOT NULL,
	`amount` integer NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_splits_txn` ON `transaction_splits` (`transaction_id`);--> statement-breakpoint
CREATE TABLE `transactions` (
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
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_txn_account_date` ON `transactions` (`account_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_txn_category_date` ON `transactions` (`category_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_txn_household_date` ON `transactions` (`household_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_txn_date` ON `transactions` (`date`);--> statement-breakpoint
CREATE INDEX `idx_txn_plaid_id` ON `transactions` (`plaid_transaction_id`);--> statement-breakpoint
CREATE INDEX `idx_txn_merchant` ON `transactions` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `idx_txn_transfer` ON `transactions` (`transfer_pair_id`);--> statement-breakpoint
CREATE TABLE `budget_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`budget_id` text NOT NULL,
	`category_id` text NOT NULL,
	`limit_amount` integer NOT NULL,
	`rollover` integer DEFAULT false,
	`is_fixed` integer DEFAULT false,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`budget_id`) REFERENCES `budgets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_budgetcat_budget_category` ON `budget_categories` (`budget_id`,`category_id`);--> statement-breakpoint
CREATE INDEX `idx_budgetcat_budget` ON `budget_categories` (`budget_id`);--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`month` text NOT NULL,
	`type` text DEFAULT 'category',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_budget_household_month` ON `budgets` (`household_id`,`month`);--> statement-breakpoint
CREATE TABLE `recurring_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`plaid_stream_id` text,
	`name` text NOT NULL,
	`merchant_id` text,
	`category_id` text,
	`average_amount` integer,
	`last_amount` integer,
	`frequency` text,
	`last_date` text,
	`next_date` text,
	`is_active` integer DEFAULT true,
	`is_income` integer DEFAULT false,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_recurring_household` ON `recurring_transactions` (`household_id`);--> statement-breakpoint
CREATE INDEX `idx_recurring_next` ON `recurring_transactions` (`next_date`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`target_amount` integer NOT NULL,
	`target_date` text,
	`linked_account_id` text,
	`icon` text,
	`color` text,
	`is_completed` integer DEFAULT false,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`linked_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_goals_household` ON `goals` (`household_id`);--> statement-breakpoint
CREATE TABLE `holdings_history` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`plaid_security_id` text,
	`security_name` text,
	`ticker` text,
	`quantity` real,
	`value` integer,
	`date` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_holdingshistory_account_date` ON `holdings_history` (`account_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_holdingshistory_security` ON `holdings_history` (`plaid_security_id`,`date`);--> statement-breakpoint
CREATE TABLE `investment_holdings` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`plaid_security_id` text,
	`security_name` text NOT NULL,
	`ticker` text,
	`quantity` real,
	`cost_basis` integer,
	`current_value` integer,
	`type` text,
	`currency` text DEFAULT 'USD',
	`as_of_date` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_holdings_account` ON `investment_holdings` (`account_id`);--> statement-breakpoint
CREATE INDEX `idx_holdings_date` ON `investment_holdings` (`account_id`,`as_of_date`);--> statement-breakpoint
CREATE TABLE `investment_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`plaid_investment_transaction_id` text,
	`security_name` text,
	`ticker` text,
	`type` text,
	`quantity` real,
	`price` integer,
	`amount` integer NOT NULL,
	`fees` integer DEFAULT 0,
	`date` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_invtxn_account_date` ON `investment_transactions` (`account_id`,`date`);--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`bill_reminders` integer DEFAULT true,
	`over_budget` integer DEFAULT true,
	`large_transactions` integer DEFAULT true,
	`large_txn_threshold` integer DEFAULT 50000,
	`weekly_summary` integer DEFAULT false,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `saved_filters` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`filter_config` text NOT NULL,
	`is_pinned` integer DEFAULT false,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_savedfilters_user` ON `saved_filters` (`user_id`);