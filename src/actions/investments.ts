"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getHouseholdId } from "@/lib/auth/session";
import { scopedQuery } from "@/lib/scoped-query";
import { db as defaultDb, type LedgrDb } from "@/db";
import { plaidItems } from "@/db/schema";
import { syncInvestments, type InvestmentSyncResult } from "@/lib/plaid/investments";
import { getInvestmentTransactions, type InvestmentFilters } from "@/queries/investments";

export async function triggerInvestmentSync(
  plaidItemId: string,
  db: LedgrDb = defaultDb,
): Promise<InvestmentSyncResult> {
  const householdId = await getHouseholdId();
  const scoped = scopedQuery(householdId, db);

  const item = db
    .select({ id: plaidItems.id })
    .from(plaidItems)
    .where(scoped.where(plaidItems, eq(plaidItems.id, plaidItemId)))
    .get();

  if (!item) {
    return { success: false, error: "Institution not found" };
  }

  const result = await syncInvestments(plaidItemId, householdId, db);

  revalidatePath("/");
  revalidatePath("/investments");

  return result;
}

export async function loadMoreInvestmentTransactions(
  cursor: string,
  filters: InvestmentFilters = {},
) {
  const householdId = await getHouseholdId();
  return getInvestmentTransactions(householdId, filters, 50, cursor);
}
