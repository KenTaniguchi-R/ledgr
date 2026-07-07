import { eq } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { transactions } from "@/db/schema";
import { cleanTransactionName } from "@/lib/import/clean-name";

/**
 * Re-derives the display `name` from `originalName` for transactions that still
 * carry the raw bank description (i.e. `name === originalName`), applying the
 * same cleanup new imports get.
 *
 * Only rows whose name still equals their original are touched, so any name a
 * user edited (or that a merchant match already cleaned) is left untouched.
 * `originalName` is never modified.
 */
export async function backfillCleanTransactionNames(
  db: LedgrDb = defaultDb,
): Promise<{ scanned: number; updated: number }> {
  const rows = await db
    .select({ id: transactions.id, name: transactions.name, originalName: transactions.originalName })
    .from(transactions)
    .where(eq(transactions.name, transactions.originalName));

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
