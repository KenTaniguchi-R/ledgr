/**
 * Operator entry point for reconstructing historical daily balances.
 * Usage: pnpm backfill-balances
 * Walks backward from each account's current balance using posted transactions
 * to fill gaps in balance_history. Non-destructive (onConflictDoNothing), so
 * re-running it is safe. Requires DATABASE_URL (loaded from .env when present).
 */
import { backfillAccountBalances } from "@/lib/jobs/backfill-balances";

async function main() {
  await backfillAccountBalances();
  console.log("[backfill-balances] done");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
