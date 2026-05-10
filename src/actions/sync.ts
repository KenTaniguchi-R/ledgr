"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getHouseholdId } from "@/lib/auth/session";
import { db as defaultDb, type LedgrDb } from "@/db";
import { plaidItems } from "@/db/schema";
import { syncInstitution, type SyncResult } from "@/lib/plaid/sync";

export async function triggerSync(
  plaidItemId: string,
  db: LedgrDb = defaultDb
): Promise<SyncResult> {
  const householdId = await getHouseholdId();

  // Verify ownership
  const item = db
    .select({ id: plaidItems.id })
    .from(plaidItems)
    .where(
      and(
        eq(plaidItems.id, plaidItemId),
        eq(plaidItems.householdId, householdId)
      )
    )
    .get();

  if (!item) {
    return { success: false, error: "Institution not found" };
  }

  const result = await syncInstitution(plaidItemId, householdId, db);

  revalidatePath("/accounts");

  return result;
}
