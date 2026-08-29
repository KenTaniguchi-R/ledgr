import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db as defaultDb, type LedgrDb } from "@/db";
import { accounts, balanceHistory } from "@/db/schema";
import { DEMO_HOUSEHOLD_ID } from "@/lib/demo-mode";
import { todayDateString } from "@/lib/date-utils";

export async function snapshotBalances(dbInstance: LedgrDb = defaultDb): Promise<void> {
  const activeAccounts = await dbInstance
    .select({ id: accounts.id, currentBalance: accounts.currentBalance })
    .from(accounts)
    .where(
      and(
        isNull(accounts.deletedAt),
        eq(accounts.isHidden, false),
        isNotNull(accounts.currentBalance),
        ne(accounts.householdId, DEMO_HOUSEHOLD_ID),
      )
    );

  const date = todayDateString();

  for (const account of activeAccounts) {
    if (account.currentBalance === null) continue;
    await dbInstance
      .insert(balanceHistory)
      .values({ id: uuid(), accountId: account.id, date, balance: account.currentBalance })
      .onConflictDoNothing({ target: [balanceHistory.accountId, balanceHistory.date] });
  }
}

/**
 * Every distinct balance_history date across all households, ascending. The
 * caller needs the whole series, not just the newest date, to tell a covered
 * history apart from one with holes in it.
 */
export async function getSnapshotDates(dbInstance: LedgrDb = defaultDb): Promise<string[]> {
  const rows = await dbInstance
    .selectDistinct({ date: balanceHistory.date })
    .from(balanceHistory)
    .orderBy(balanceHistory.date);
  return rows.map((r) => r.date);
}
