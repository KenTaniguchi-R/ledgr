-- better-auth 1.7 added `account.issuer`, which namespaces an identity to the
-- authority that issued it. It is not optional: sign-in looks up the credential
-- account with `issuer = 'local:credential'` in the WHERE clause, so an existing
-- row left NULL here is an account nobody can log into any more. Add nullable,
-- backfill every existing row, then enforce NOT NULL.
--
-- Ledgr configures no social providers, so in practice every row is a credential
-- account; the CASE covers a fork that added one before upgrading.
ALTER TABLE "account" ADD COLUMN "issuer" text;--> statement-breakpoint
UPDATE "account" SET "issuer" = CASE WHEN "provider_id" = 'credential' THEN 'local:credential' ELSE 'local:oauth:' || "provider_id" END WHERE "issuer" IS NULL;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;
