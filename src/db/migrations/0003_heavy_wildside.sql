ALTER TABLE `plaid_items` ADD `plaid_item_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_plaid_items_plaid_item_id` ON `plaid_items` (`plaid_item_id`);