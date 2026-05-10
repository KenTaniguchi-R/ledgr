ALTER TABLE `user_settings` ADD `ai_base_url` text;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `ai_confidence_threshold` text DEFAULT '0.7';--> statement-breakpoint
ALTER TABLE `user_settings` ADD `tool_calling_supported` integer;--> statement-breakpoint
ALTER TABLE `transactions` ADD `external_id` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `ai_categorization_attempted_at` text;--> statement-breakpoint
CREATE INDEX `idx_txn_external_id` ON `transactions` (`account_id`,`external_id`);