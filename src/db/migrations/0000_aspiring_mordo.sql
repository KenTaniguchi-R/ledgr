CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_members" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"theme" text DEFAULT 'system',
	"currency" text DEFAULT 'USD',
	"ai_provider" text,
	"ai_model" text,
	"ai_api_key" text,
	"ai_base_url" text,
	"ai_confidence_threshold" text DEFAULT '0.7',
	"tool_calling_supported" boolean,
	"mcp_enabled" boolean DEFAULT false NOT NULL,
	"dashboard_layout" text,
	"demo_mode" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "institution_logos" (
	"id" text PRIMARY KEY NOT NULL,
	"plaid_item_id" text NOT NULL,
	"logo" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plaid_items" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"access_token" text NOT NULL,
	"plaid_institution_id" text,
	"plaid_item_id" text,
	"institution_name" text,
	"sync_cursor" text,
	"status" text DEFAULT 'active',
	"error_code" text,
	"primary_color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_log" (
	"id" text PRIMARY KEY NOT NULL,
	"plaid_item_id" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cursor_before" text,
	"cursor_after" text,
	"added_count" integer DEFAULT 0,
	"modified_count" integer DEFAULT 0,
	"removed_count" integer DEFAULT 0,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"plaid_item_id" text,
	"plaid_account_id" text,
	"name" text NOT NULL,
	"official_name" text,
	"type" text NOT NULL,
	"subtype" text,
	"current_balance" integer,
	"available_balance" integer,
	"credit_limit" integer,
	"currency" text DEFAULT 'USD',
	"is_manual" boolean DEFAULT false,
	"is_hidden" boolean DEFAULT false,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "balance_history" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"date" text NOT NULL,
	"balance" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"group_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"is_income" boolean DEFAULT false,
	"is_system" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"sort_order" integer DEFAULT 0,
	"is_system" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"category_id" text NOT NULL,
	"match_field" text DEFAULT 'name',
	"match_pattern" text NOT NULL,
	"priority" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"name" text NOT NULL,
	"raw_names" text,
	"logo_url" text,
	"category_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_splits" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"category_id" text NOT NULL,
	"amount" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"household_id" text NOT NULL,
	"plaid_transaction_id" text,
	"pending_transaction_id" text,
	"merchant_id" text,
	"category_id" text,
	"recurring_transaction_id" text,
	"transfer_pair_id" text,
	"date" text NOT NULL,
	"original_name" text NOT NULL,
	"name" text NOT NULL,
	"amount" integer NOT NULL,
	"normalized_amount" integer NOT NULL,
	"currency" text DEFAULT 'USD',
	"pending" boolean DEFAULT false,
	"reviewed" boolean DEFAULT false,
	"notes" text,
	"tags" text,
	"is_transfer" boolean DEFAULT false,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"external_id" text,
	"ai_categorization_attempted_at" timestamp with time zone,
	"pfc_primary" text,
	"pfc_detailed" text,
	"category_source" text
);
--> statement-breakpoint
CREATE TABLE "budget_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"category_id" text NOT NULL,
	"limit_amount" integer NOT NULL,
	"rollover" boolean DEFAULT false,
	"is_fixed" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"month" text NOT NULL,
	"type" text DEFAULT 'category',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"plaid_stream_id" text,
	"account_id" text,
	"name" text NOT NULL,
	"merchant_id" text,
	"category_id" text,
	"average_amount" integer,
	"last_amount" integer,
	"frequency" text,
	"last_date" text,
	"next_date" text,
	"is_active" boolean DEFAULT true,
	"is_income" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holdings_history" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"plaid_security_id" text,
	"security_name" text,
	"ticker" text,
	"quantity" double precision,
	"value" integer,
	"date" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_holdings" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"plaid_security_id" text,
	"security_name" text NOT NULL,
	"ticker" text,
	"quantity" double precision,
	"cost_basis" integer,
	"current_value" integer,
	"type" text,
	"sector" text,
	"currency" text DEFAULT 'USD',
	"as_of_date" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"plaid_investment_transaction_id" text,
	"security_name" text,
	"ticker" text,
	"type" text,
	"quantity" double precision,
	"price" integer,
	"amount" integer NOT NULL,
	"fees" integer DEFAULT 0,
	"date" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"name" text NOT NULL,
	"report_type" text NOT NULL,
	"filters" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_name" text,
	"redirect_uris" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "oauth_clients_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"household_id" text NOT NULL,
	"scope" text NOT NULL,
	"code_challenge" text NOT NULL,
	"code_challenge_method" text DEFAULT 'S256' NOT NULL,
	"redirect_uri" text NOT NULL,
	"expires_at" text NOT NULL,
	"used" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_consents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"scope" text NOT NULL,
	"granted_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_refresh_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"household_id" text NOT NULL,
	"scope" text NOT NULL,
	"expires_at" text NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_logos" ADD CONSTRAINT "institution_logos_plaid_item_id_plaid_items_id_fk" FOREIGN KEY ("plaid_item_id") REFERENCES "plaid_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plaid_items" ADD CONSTRAINT "plaid_items_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_log" ADD CONSTRAINT "sync_log_plaid_item_id_plaid_items_id_fk" FOREIGN KEY ("plaid_item_id") REFERENCES "plaid_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_plaid_item_id_plaid_items_id_fk" FOREIGN KEY ("plaid_item_id") REFERENCES "plaid_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_history" ADD CONSTRAINT "balance_history_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_group_id_category_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "category_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_groups" ADD CONSTRAINT "category_groups_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_transaction_id_recurring_transactions_id_fk" FOREIGN KEY ("recurring_transaction_id") REFERENCES "recurring_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings_history" ADD CONSTRAINT "holdings_history_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_holdings" ADD CONSTRAINT "investment_holdings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_reports" ADD CONSTRAINT "saved_reports_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_household_user" ON "household_members" USING btree ("household_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_institution_logos_plaid_item" ON "institution_logos" USING btree ("plaid_item_id");--> statement-breakpoint
CREATE INDEX "idx_plaid_items_household" ON "plaid_items" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "idx_plaid_items_household_institution" ON "plaid_items" USING btree ("household_id","plaid_institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_plaid_items_plaid_item_id" ON "plaid_items" USING btree ("plaid_item_id");--> statement-breakpoint
CREATE INDEX "idx_sync_log_plaid_item_id" ON "sync_log" USING btree ("plaid_item_id");--> statement-breakpoint
CREATE INDEX "idx_accounts_household" ON "accounts" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "idx_accounts_plaid_item" ON "accounts" USING btree ("plaid_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_balance_account_date" ON "balance_history" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "idx_balance_history_account_date" ON "balance_history" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "idx_categories_household" ON "categories" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "idx_categories_group" ON "categories" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "idx_catgroups_household" ON "category_groups" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "idx_catrules_household" ON "category_rules" USING btree ("household_id","priority");--> statement-breakpoint
CREATE INDEX "idx_merchants_household" ON "merchants" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "idx_merchants_household_name" ON "merchants" USING btree ("household_id","name");--> statement-breakpoint
CREATE INDEX "idx_splits_txn" ON "transaction_splits" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "idx_splits_category" ON "transaction_splits" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_txn_account_date" ON "transactions" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "idx_txn_category_date" ON "transactions" USING btree ("category_id","date");--> statement-breakpoint
CREATE INDEX "idx_txn_household_date" ON "transactions" USING btree ("household_id","date");--> statement-breakpoint
CREATE INDEX "idx_txn_date" ON "transactions" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_txn_plaid_id_unique" ON "transactions" USING btree ("plaid_transaction_id");--> statement-breakpoint
CREATE INDEX "idx_txn_merchant" ON "transactions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_txn_transfer" ON "transactions" USING btree ("transfer_pair_id");--> statement-breakpoint
CREATE INDEX "idx_txn_external_id" ON "transactions" USING btree ("account_id","external_id");--> statement-breakpoint
CREATE INDEX "idx_txn_household_reviewed_date" ON "transactions" USING btree ("household_id","reviewed","date");--> statement-breakpoint
CREATE INDEX "idx_txn_household_transfer_date" ON "transactions" USING btree ("household_id","is_transfer","date");--> statement-breakpoint
CREATE INDEX "idx_txn_household_date_id" ON "transactions" USING btree ("household_id","date","id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_budgetcat_budget_category" ON "budget_categories" USING btree ("budget_id","category_id");--> statement-breakpoint
CREATE INDEX "idx_budgetcat_budget" ON "budget_categories" USING btree ("budget_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_budget_household_month" ON "budgets" USING btree ("household_id","month");--> statement-breakpoint
CREATE INDEX "idx_recurring_household" ON "recurring_transactions" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "idx_recurring_next" ON "recurring_transactions" USING btree ("next_date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_recurring_plaid_stream_id" ON "recurring_transactions" USING btree ("plaid_stream_id");--> statement-breakpoint
CREATE INDEX "idx_holdingshistory_account_date" ON "holdings_history" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "idx_holdingshistory_security" ON "holdings_history" USING btree ("plaid_security_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_holdingshistory_account_security_date" ON "holdings_history" USING btree ("account_id","plaid_security_id","date");--> statement-breakpoint
CREATE INDEX "idx_holdings_account" ON "investment_holdings" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_holdings_date" ON "investment_holdings" USING btree ("account_id","as_of_date");--> statement-breakpoint
CREATE INDEX "idx_holdings_security" ON "investment_holdings" USING btree ("plaid_security_id");--> statement-breakpoint
CREATE INDEX "idx_invtxn_account_date" ON "investment_transactions" USING btree ("account_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_invtxn_plaid_id" ON "investment_transactions" USING btree ("plaid_investment_transaction_id");--> statement-breakpoint
CREATE INDEX "idx_saved_reports_household" ON "saved_reports" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_consent_user_client" ON "oauth_consents" USING btree ("user_id","client_id");