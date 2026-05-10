CREATE TABLE `institution_logos` (
	`id` text PRIMARY KEY NOT NULL,
	`plaid_item_id` text NOT NULL,
	`logo` text NOT NULL,
	FOREIGN KEY (`plaid_item_id`) REFERENCES `plaid_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_institution_logos_plaid_item` ON `institution_logos` (`plaid_item_id`);--> statement-breakpoint
ALTER TABLE `plaid_items` ADD `primary_color` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `pfc_primary` text;