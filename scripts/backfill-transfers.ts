/**
 * Operator entry point for tagging historical self-transfers that predate
 * automatic transfer detection.
 * Usage: pnpm backfill-transfers
 * Requires DATABASE_URL (loaded from .env when present).
 */
import { backfillTransfers } from "@/lib/jobs/backfill-transfers";

async function main() {
  const { households, tagged } = await backfillTransfers();
  console.log(`[backfill-transfers] households=${households} tagged=${tagged}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
