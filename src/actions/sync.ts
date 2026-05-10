"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getHouseholdId } from "@/lib/auth/session";
import { scopedQuery } from "@/lib/scoped-query";
import { db as defaultDb, type LedgrDb } from "@/db";
import { plaidItems } from "@/db/schema";
import { syncInstitution, type SyncResult } from "@/lib/plaid/sync";

export async function triggerSync(
  plaidItemId: string,
  db: LedgrDb = defaultDb
): Promise<SyncResult> {
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

  const result = await syncInstitution(plaidItemId, householdId, db);

  revalidatePath("/");
  revalidatePath("/accounts");
  revalidatePath("/transactions");

  return result;
}
