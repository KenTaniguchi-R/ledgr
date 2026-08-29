import { and, eq, isNull, inArray, notInArray } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { transactions, recurringTransactions } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";
import { withHousehold } from "@/lib/household-context";
import { todayDateString } from "@/lib/date-utils";
import { v4 as uuid } from "uuid";

export interface RecurringCandidate {
  id: string;
  accountId: string;
  name: string;
  date: string; // YYYY-MM-DD
  normalizedAmount: number; // cents; positive = inflow, negative = outflow
}

type Frequency = "weekly" | "biweekly" | "monthly" | "yearly";

export interface RecurringGroup {
  accountId: string;
  name: string;
  occurrenceIds: string[];
  averageAmount: number; // cents, absolute value, rounded
  lastAmount: number; // cents, signed — the most recent occurrence's normalizedAmount
  frequency: Frequency;
  lastDate: string;
  nextDate: string; // predicted, YYYY-MM-DD
  isIncome: boolean;
  isActive: boolean;
}

const MS_PER_DAY = 86_400_000;
const CONSISTENCY_TOLERANCE = 0.4;
const OVERDUE_MULTIPLIER = 1.5;

function daysBetween(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / MS_PER_DAY;
}

function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function classifyFrequency(gap: number): Frequency | null {
  if (gap >= 5 && gap <= 9) return "weekly";
  if (gap >= 10 && gap <= 18) return "biweekly";
  if (gap >= 25 && gap <= 35) return "monthly";
  if (gap >= 350 && gap <= 380) return "yearly";
  return null;
}

/**
 * Pure heuristic: groups same-(accountId, name) transactions into recurring
 * streams when they occur at least 3 times with a consistent cadence. Unlike
 * Plaid (which has its own recurring-transactions API), SimpleFIN gives us
 * nothing but raw transactions, so this reconstructs the same idea from
 * amount/date patterns. Favors missing a real recurring charge over flagging
 * two unrelated same-name transactions as one.
 */
export function detectRecurringGroups(candidates: RecurringCandidate[], today: string): RecurringGroup[] {
  const groups = new Map<string, RecurringCandidate[]>();
  for (const c of candidates) {
    const key = `${c.accountId}\u0000${c.name}`;
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }

  const results: RecurringGroup[] = [];

  for (const occurrences of groups.values()) {
    if (occurrences.length < 3) continue;

    const allPositive = occurrences.every((o) => o.normalizedAmount > 0);
    const allNegative = occurrences.every((o) => o.normalizedAmount < 0);
    if (!allPositive && !allNegative) continue;

    const sorted = [...occurrences].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date));
    }

    const medianGap = median(gaps);
    const frequency = classifyFrequency(medianGap);
    if (!frequency) continue;

    const consistent = gaps.every((g) => Math.abs(g - medianGap) / medianGap <= CONSISTENCY_TOLERANCE);
    if (!consistent) continue;

    const last = sorted[sorted.length - 1];
    const averageAmount = Math.round(
      occurrences.reduce((sum, o) => sum + Math.abs(o.normalizedAmount), 0) / occurrences.length,
    );
    const nextDate = addDays(last.date, medianGap);
    const isActive = daysBetween(nextDate, today) <= medianGap * OVERDUE_MULTIPLIER;

    results.push({
      accountId: last.accountId,
      name: last.name,
      occurrenceIds: occurrences.map((o) => o.id),
      averageAmount,
      lastAmount: last.normalizedAmount,
      frequency,
      lastDate: last.date,
      nextDate,
      isIncome: allPositive,
      isActive,
    });
  }

  return results;
}

/**
 * Applies detectRecurringGroups to a household's SimpleFIN-sourced
 * transactions and upserts the result into recurring_transactions. SimpleFIN
 * rows have no plaidStreamId, so an existing row is matched by
 * (accountId, name) among rows where plaidStreamId IS NULL. Idempotent: a
 * repeat call with no new transactions updates existing rows to the same
 * values rather than duplicating them.
 *
 * Each detected stream's transactions are back-linked via
 * recurringTransactionId, and any SimpleFIN-sourced stream this pass did not
 * re-detect is deactivated. Returns the number of groups applied.
 */
export async function applyRecurringDetection(householdId: string, db: LedgrDb = defaultDb): Promise<number> {
  return withHousehold(
    householdId,
    async (tx) => {
      const scoped = scopedQuery(householdId, tx);

      const rows = await tx
        .select({
          id: transactions.id,
          accountId: transactions.accountId,
          name: transactions.name,
          date: transactions.date,
          normalizedAmount: transactions.normalizedAmount,
        })
        .from(transactions)
        .where(
          scoped.where(
            transactions,
            notDeleted(transactions),
            eq(transactions.provider, "simplefin"),
            eq(transactions.pending, false),
            eq(transactions.isTransfer, false),
          ),
        );

      const groups = detectRecurringGroups(rows, todayDateString());
      const now = new Date();
      const upsertedIds: string[] = [];

      for (const group of groups) {
        const [existing] = await tx
          .select({ id: recurringTransactions.id })
          .from(recurringTransactions)
          .where(
            and(
              eq(recurringTransactions.householdId, householdId),
              eq(recurringTransactions.accountId, group.accountId),
              eq(recurringTransactions.name, group.name),
              isNull(recurringTransactions.plaidStreamId),
            ),
          )
          .limit(1);

        const fields = {
          accountId: group.accountId,
          name: group.name,
          merchantId: null,
          categoryId: null,
          averageAmount: group.averageAmount,
          lastAmount: group.lastAmount,
          frequency: group.frequency,
          lastDate: group.lastDate,
          nextDate: group.nextDate,
          isActive: group.isActive,
          isIncome: group.isIncome,
          updatedAt: now,
        };

        let recurringId: string;
        if (existing) {
          recurringId = existing.id;
          await tx.update(recurringTransactions).set(fields).where(eq(recurringTransactions.id, existing.id));
        } else {
          recurringId = uuid();
          await tx.insert(recurringTransactions).values({
            id: recurringId,
            householdId,
            plaidStreamId: null,
            createdAt: now,
            ...fields,
          });
        }
        upsertedIds.push(recurringId);

        // Back-link the occurrences, matching what the Plaid path does with
        // stream.transaction_ids. One batched UPDATE per stream.
        if (group.occurrenceIds.length > 0) {
          await tx.update(transactions)
            .set({ recurringTransactionId: recurringId, updatedAt: now })
            .where(
              and(
                inArray(transactions.id, group.occurrenceIds),
                eq(transactions.householdId, householdId),
              ),
            );
        }
      }

      // Retire anything this pass didn't re-detect, mirroring the Plaid path's
      // seenStreamIds sweep. Scoped to SimpleFIN-sourced rows so Plaid's
      // streams — which the other path owns — are never touched. This also
      // collects rows orphaned by `accountId onDelete: "set null"`, which can
      // no longer be matched by (accountId, name) and would otherwise
      // accumulate as active duplicates beside each re-detected stream.
      const sweepConditions = [
        eq(recurringTransactions.householdId, householdId),
        isNull(recurringTransactions.plaidStreamId),
        eq(recurringTransactions.isActive, true),
      ];
      if (upsertedIds.length > 0) {
        sweepConditions.push(notInArray(recurringTransactions.id, upsertedIds));
      }
      await tx.update(recurringTransactions)
        .set({ isActive: false, updatedAt: now })
        .where(and(...sweepConditions));

      return groups.length;
    },
    db,
  );
}
