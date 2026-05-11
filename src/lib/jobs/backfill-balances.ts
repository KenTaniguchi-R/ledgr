import { eq, and, isNull, desc } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { accounts, balanceHistory, transactions } from "@/db/schema";
import { todayDateString } from "@/lib/date-utils";
import { v4 as uuid } from "uuid";

/**
 * Reconstructs approximate historical daily balances for all eligible accounts
 * by walking backward from the current balance using posted transactions.
 *
 * - Skips investment accounts (use Plaid investments endpoint instead)
 * - Skips hidden and deleted accounts
 * - Skips accounts without a currentBalance
 * - Non-destructive: uses onConflictDoNothing so existing rows are preserved
 */
export async function backfillAccountBalances(db: LedgrDb = defaultDb): Promise<void> {
  // 1. Get all eligible accounts
  const allAccounts = await db
    .select()
    .from(accounts)
    .where(
      and(
        isNull(accounts.deletedAt),
        eq(accounts.isHidden, false),
      )
    );

  const eligibleAccounts = allAccounts.filter(
    (acct) =>
      acct.currentBalance !== null &&
      acct.currentBalance !== undefined &&
      acct.type !== "investment"
  );

  const today = todayDateString();

  for (const acct of eligibleAccounts) {
    const currentBalance = acct.currentBalance as number;

    // 2. Get all posted, non-deleted transactions for this account, ordered newest first
    const txns = await db
      .select({
        date: transactions.date,
        normalizedAmount: transactions.normalizedAmount,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, acct.id),
          eq(transactions.pending, false),
          isNull(transactions.deletedAt)
        )
      )
      .orderBy(desc(transactions.date));

    if (txns.length === 0) {
      continue;
    }

    // 3. Group transactions by date, summing normalizedAmount per day
    const dailyNetMap = new Map<string, number>();
    for (const txn of txns) {
      const existing = dailyNetMap.get(txn.date) ?? 0;
      dailyNetMap.set(txn.date, existing + txn.normalizedAmount);
    }

    // 4. Walk backward from currentBalance on today's date
    // For depository (checking/savings): balance decreases with outflows, so undo = subtract normalizedAmount
    // For credit/loan: balance increases with charges, so undo = add normalizedAmount
    const isLiability = acct.type === "credit" || acct.type === "loan";
    const undoSign = isLiability ? 1 : -1;

    const sortedDates = [...dailyNetMap.keys()].sort((a, b) => b.localeCompare(a)); // newest first

    let runningBalance = currentBalance;
    const rowsToInsert: Array<{ id: string; accountId: string; date: string; balance: number }> = [];

    for (const date of sortedDates) {
      const dayNet = dailyNetMap.get(date)!;

      if (date >= today) {
        runningBalance = runningBalance + undoSign * dayNet;
        continue;
      }

      runningBalance = runningBalance + undoSign * dayNet;

      rowsToInsert.push({
        id: uuid(),
        accountId: acct.id,
        date,
        balance: runningBalance,
      });
    }

    // 5. Insert rows non-destructively
    if (rowsToInsert.length > 0) {
      await db.insert(balanceHistory)
        .values(rowsToInsert)
        .onConflictDoNothing();
    }
  }
}
