ALTER TABLE "transactions" ADD COLUMN "transfer_source" text;--> statement-breakpoint
-- Backfill provenance for rows tagged before this column existed. Pair
-- detection is the only writer of transfer_pair_id; Plaid's PFC tagging sets
-- is_transfer alone. Neither was user-driven, so nothing backfills to manual.
UPDATE "transactions" SET "transfer_source" = 'auto' WHERE "transfer_pair_id" IS NOT NULL;--> statement-breakpoint
UPDATE "transactions" SET "transfer_source" = 'pfc' WHERE "is_transfer" = true AND "transfer_pair_id" IS NULL;
