import { and, asc, eq, ne } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { bankConnections } from "@/db/schema/bank-connections";
import { DEMO_HOUSEHOLD_ID } from "@/lib/demo-mode";

export type ActivePlaidItemRef = {
  itemId: string;
  householdId: string;
};

/**
 * Lists Plaid items eligible for scheduled sync: status="active" and not
 * belonging to the demo household. Used by the daily safety-sync task.
 */
export async function listActivePlaidItems(
  db: LedgrDb = defaultDb,
): Promise<ActivePlaidItemRef[]> {
  const rows = await db
    .select({ itemId: bankConnections.id, householdId: bankConnections.householdId })
    .from(bankConnections)
    .where(
      and(
        eq(bankConnections.status, "active"),
        eq(bankConnections.provider, "plaid"),
        ne(bankConnections.householdId, DEMO_HOUSEHOLD_ID),
      ),
    )
    .orderBy(asc(bankConnections.id));

  return rows;
}
