/**
 * Operator entry point for cleaning up raw transaction display names.
 * Usage: pnpm backfill-clean-names
 * Re-derives `name` from `originalName` for rows that still hold the raw bank
 * description. Requires DATABASE_URL (loaded from .env when present).
 */
import { backfillCleanTransactionNames } from "@/lib/jobs/backfill-clean-names";

async function main() {
  const { scanned, updated } = await backfillCleanTransactionNames();
  console.log(`[backfill-clean-names] scanned=${scanned} updated=${updated}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
