import { eq, isNull, ne, or } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { transactions } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";
import { withHousehold } from "@/lib/household-context";

export interface TransferCandidate {
  id: string;
  accountId: string;
  date: string; // YYYY-MM-DD
  normalizedAmount: number; // cents; positive = inflow, negative = outflow
}

export interface TransferPair {
  outflowId: string;
  inflowId: string;
}

const MS_PER_DAY = 86_400_000;

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / MS_PER_DAY;
}

function isMatch(a: TransferCandidate, b: TransferCandidate, maxDateWindowDays: number): boolean {
  return (
    a.accountId !== b.accountId &&
    Math.abs(a.normalizedAmount) === Math.abs(b.normalizedAmount) &&
    daysBetween(a.date, b.date) <= maxDateWindowDays
  );
}

/**
 * Pure heuristic: pairs same-household transactions that look like a transfer
 * between two of the household's own accounts — opposite-signed, exact-amount
 * match, in different accounts, within a short date window. Only pairs when
 * the match is mutually unique (each side has exactly one plausible
 * counterpart) — an ambiguous match is left untagged rather than risk
 * miscategorizing two unrelated same-amount transactions as a transfer.
 */
export function detectTransferPairs(
  candidates: TransferCandidate[],
  maxDateWindowDays = 3,
): TransferPair[] {
  const outflows = candidates.filter((c) => c.normalizedAmount < 0);
  const inflows = candidates.filter((c) => c.normalizedAmount > 0);

  const pairs: TransferPair[] = [];
  const used = new Set<string>();

  for (const outflow of outflows) {
    if (used.has(outflow.id)) continue;

    const matchingInflows = inflows.filter(
      (inflow) => !used.has(inflow.id) && isMatch(outflow, inflow, maxDateWindowDays),
    );
    if (matchingInflows.length !== 1) continue;
    const inflow = matchingInflows[0];

    const matchingOutflowsForInflow = outflows.filter(
      (candidate) => !used.has(candidate.id) && isMatch(candidate, inflow, maxDateWindowDays),
    );
    if (matchingOutflowsForInflow.length !== 1 || matchingOutflowsForInflow[0].id !== outflow.id) continue;

    pairs.push({ outflowId: outflow.id, inflowId: inflow.id });
    used.add(outflow.id);
    used.add(inflow.id);
  }

  return pairs;
}

/**
 * Applies detectTransferPairs to a household's untagged transactions and
 * persists the result. Idempotent: only ever operates on rows that are still
 * untagged (isTransfer=false, transferPairId IS NULL), so already-tagged
 * pairs are naturally skipped on a repeat call. Returns the number of pairs
 * tagged.
 */
export async function applyTransferDetection(
  householdId: string,
  db: LedgrDb = defaultDb,
): Promise<number> {
  return withHousehold(
    householdId,
    async (tx) => {
      const scoped = scopedQuery(householdId, tx);

      const rows = await tx
        .select({
          id: transactions.id,
          accountId: transactions.accountId,
          date: transactions.date,
          normalizedAmount: transactions.normalizedAmount,
        })
        .from(transactions)
        .where(
          scoped.where(
            transactions,
            notDeleted(transactions),
            eq(transactions.isTransfer, false),
            isNull(transactions.transferPairId),
            eq(transactions.pending, false),
            // A user who un-marked a transfer must not have it silently
            // re-paired on the next sync. NULL means "never decided", so it
            // has to be spelled out — `!= 'manual_rejected'` alone is NULL
            // (and therefore falsy) for those rows.
            or(
              isNull(transactions.transferSource),
              ne(transactions.transferSource, "manual_rejected"),
            ),
          ),
        );

      const pairs = detectTransferPairs(rows);

      for (const pair of pairs) {
        await tx.update(transactions)
          .set({ isTransfer: true, transferPairId: pair.inflowId, transferSource: "auto", updatedAt: new Date() })
          .where(eq(transactions.id, pair.outflowId));
        await tx.update(transactions)
          .set({ isTransfer: true, transferPairId: pair.outflowId, transferSource: "auto", updatedAt: new Date() })
          .where(eq(transactions.id, pair.inflowId));
      }

      return pairs.length;
    },
    db,
  );
}
