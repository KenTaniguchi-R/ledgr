ALTER TABLE `investment_holdings` ADD `sector` text;--> statement-breakpoint
CREATE INDEX `idx_holdings_security` ON `investment_holdings` (`plaid_security_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_holdingshistory_account_security_date` ON `holdings_history` (`account_id`,`plaid_security_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_invtxn_plaid_id` ON `investment_transactions` (`plaid_investment_transaction_id`);