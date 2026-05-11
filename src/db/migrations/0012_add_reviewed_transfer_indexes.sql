CREATE INDEX `idx_txn_household_reviewed_date` ON `transactions` (`household_id`,`reviewed`,`date`);
--> statement-breakpoint
CREATE INDEX `idx_txn_household_transfer_date` ON `transactions` (`household_id`,`is_transfer`,`date`);
