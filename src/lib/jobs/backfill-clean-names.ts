import { eq, and } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { transactions, households } from "@/db/schema";
import { cleanTransactionName } from "@/lib/import/clean-name";
import { withHousehold } from "@/lib/household-context";

/**
 * Re-derives the display `name` from `originalName`, across every household,
 * for transactions that still carry the raw bank description (i.e. `name ===
 * originalName`), applying the same cleanup new imports get.
 *
 * Only rows whose name still equals their original are touched, so any name a
 * user edited (or that a merchant match already cleaned) is left untouched.
 * `originalName` is never modified.
 *
 * Cross-household by design (an operator maintenance job, run via `pnpm
 * backfill-clean-names` — not reachable from the app), so it loops one
 * household at a time in its own transaction rather than running inside a
 * single withHousehold() call — see backfill-balances.ts for the same
 * pattern and why.
 */
export async function backfillCleanTransactionNames(
  db: LedgrDb = defaultDb,
): Promise<{ scanned: number; updated: number }> {
  const allHouseholds = await db.select({ id: households.id }).from(households);

  let scanned = 0;
  let updated = 0;
  for (const { id: householdId } of allHouseholds) {
    const result = await withHousehold(householdId, (tx) => backfillForHousehold(householdId, tx), db);
    scanned += result.scanned;
    updated += result.updated;
  }

  return { scanned, updated };
}

async function backfillForHousehold(
  householdId: string,
  db: LedgrDb,
): Promise<{ scanned: number; updated: number }> {
  const rows = await db
    .select({ id: transactions.id, name: transactions.name, originalName: transactions.originalName })
    .from(transactions)
    .where(and(eq(transactions.householdId, householdId), eq(transactions.name, transactions.originalName)));

  let updated = 0;
  for (const row of rows) {
    if (!row.originalName) continue;
    const cleaned = cleanTransactionName(row.originalName);
    if (cleaned && cleaned !== row.name) {
      await db.update(transactions).set({ name: cleaned }).where(eq(transactions.id, row.id));
      updated += 1;
    }
  }

  return { scanned: rows.length, updated };
}
