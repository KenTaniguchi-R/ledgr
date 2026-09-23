-- Re-offer transactions that pre-#168 AI categorization stranded.
--
-- Before #168 the categorizer stamped ai_categorization_attempted_at on every
-- row it saw, even when it discarded the model's pick (low confidence, or an
-- expense mis-signed as income in the prompt). The scan only picks up rows with
-- a NULL stamp, so those rows were never offered again and sat Uncategorized
-- forever. #168 fixed the code but not the stamps already written.
--
-- Scope: rows still uncategorized with no provenance. A row the user manually
-- set back to Uncategorized also matches; it gets one more AI pass, which is
-- the same outcome a fresh import would give it.
UPDATE "transactions"
SET "ai_categorization_attempted_at" = NULL
WHERE "category_id" IS NULL
  AND "category_source" IS NULL
  AND "deleted_at" IS NULL
  AND "ai_categorization_attempted_at" IS NOT NULL;
