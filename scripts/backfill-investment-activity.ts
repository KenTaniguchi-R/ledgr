/**
 * Operator entry point for tagging historical investment-account activity
 * (brokerage fills, clearing fees) that predates the investment-account
 * exclusion.
 * Usage: pnpm backfill-investment-activity
 * Requires DATABASE_URL (loaded from .env when present).
 */
import { backfillInvestmentActivity } from "@/lib/jobs/backfill-investment-activity";

async function main() {
  const { households, tagged } = await backfillInvestmentActivity();
  console.log(`[backfill-investment-activity] households=${households} tagged=${tagged}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
