import { eq, isNull, ne, or } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { transactions, merchants } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";
import { withHousehold } from "@/lib/household-context";
import { classifySingleLegTransfer } from "@/lib/transfer-patterns";

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

export interface TransferDetectionResult {
  /** Pairs matched across two of the household's own accounts. */
  pairs: number;
  /** Single-leg, high-confidence name/memo matches — tagged isTransfer=true immediately. */
  patterns: number;
  /** Single-leg, low-confidence matches (bare P2P processor names) — left isTransfer=false, routed to the review queue. */
  suggested: number;
}

/**
 * Applies transfer detection to a household's untagged transactions and
 * persists the result, in two tiers:
 *
 * 1. detectTransferPairs — two of the household's own accounts, opposite
 *    sign, exact amount, short date window.
 * 2. Whatever pairing leaves untagged is tried against name/memo patterns
 *    (classifySingleLegTransfer) — for a transaction whose other leg isn't a
 *    Ledgr account at all (an external credit card payoff, a savings account
 *    at another bank, a P2P counterparty). High-confidence matches are
 *    trusted immediately like a pair match; low-confidence matches are
 *    flagged for the review queue without touching isTransfer.
 *
 * Idempotent: both tiers only ever operate on rows still untagged
 * (isTransfer=false, transferPairId IS NULL, transferSource not yet
 * decided), so a repeat call naturally skips already-tagged rows.
 */
export async function applyTransferDetection(
  householdId: string,
  db: LedgrDb = defaultDb,
): Promise<TransferDetectionResult> {
  return withHousehold(
    householdId,
    async (tx) => {
      const scoped = scopedQuery(householdId, tx);

      // A user who un-marked a transfer must not have it silently re-paired
      // on the next sync. NULL means "never decided", so it has to be
      // spelled out — `!= 'manual_rejected'` alone is NULL (and therefore
      // falsy) for those rows.
      const untagged = () =>
        scoped.where(
          transactions,
          notDeleted(transactions),
          eq(transactions.isTransfer, false),
          isNull(transactions.transferPairId),
          eq(transactions.pending, false),
          or(
            isNull(transactions.transferSource),
            ne(transactions.transferSource, "manual_rejected"),
          ),
        );

      const rows = await tx
        .select({
          id: transactions.id,
          accountId: transactions.accountId,
          date: transactions.date,
          normalizedAmount: transactions.normalizedAmount,
        })
        .from(transactions)
        .where(untagged());

      const pairs = detectTransferPairs(rows);

      for (const pair of pairs) {
        await tx.update(transactions)
          .set({ isTransfer: true, transferPairId: pair.inflowId, transferSource: "auto", updatedAt: new Date() })
          .where(eq(transactions.id, pair.outflowId));
        await tx.update(transactions)
          .set({ isTransfer: true, transferPairId: pair.outflowId, transferSource: "auto", updatedAt: new Date() })
          .where(eq(transactions.id, pair.inflowId));
      }

      // Re-select rather than filter `rows` in memory: the UPDATEs above are
      // visible to this same transaction, so `untagged()` already excludes
      // the rows just paired, and this query additionally needs merchantName
      // (a join `rows` above never fetched).
      const singleLegCandidates = await tx
        .select({
          id: transactions.id,
          name: transactions.name,
          merchantName: merchants.name,
        })
        .from(transactions)
        .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
        .where(untagged());

      let patternCount = 0;
      let suggestedCount = 0;

      for (const row of singleLegCandidates) {
        const match = classifySingleLegTransfer(row.name, row.merchantName ?? null);
        if (!match) continue;

        if (match === "pattern") {
          patternCount++;
          await tx.update(transactions)
            .set({ isTransfer: true, transferSource: "pattern", updatedAt: new Date() })
            .where(eq(transactions.id, row.id));
        } else {
          suggestedCount++;
          await tx.update(transactions)
            .set({ transferSource: "suggested", updatedAt: new Date() })
            .where(eq(transactions.id, row.id));
        }
      }

      return { pairs: pairs.length, patterns: patternCount, suggested: suggestedCount };
    },
    db,
  );
}
