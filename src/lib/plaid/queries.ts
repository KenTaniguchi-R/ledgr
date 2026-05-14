import { and, asc, eq, ne } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { plaidItems } from "@/db/schema/plaid";
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
    .select({ itemId: plaidItems.id, householdId: plaidItems.householdId })
    .from(plaidItems)
    .where(
      and(
        eq(plaidItems.status, "active"),
        ne(plaidItems.householdId, DEMO_HOUSEHOLD_ID),
      ),
    )
    .orderBy(asc(plaidItems.id));

  return rows;
}
