"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getHouseholdId, getSession } from "@/lib/auth/session";
import { guardDemoMode } from "@/lib/demo-mode";
import { scopedQuery } from "@/lib/scoped-query";
import { db as defaultDb, type LedgrDb } from "@/db";
import { plaidItems } from "@/db/schema";
import { syncInstitution, type SyncResult } from "@/lib/plaid/sync";
import { syncInvestments } from "@/lib/plaid/investments";

export async function triggerSync(
  plaidItemId: string,
  db: LedgrDb = defaultDb
): Promise<SyncResult> {
  const householdId = await getHouseholdId();
  const session = await getSession();
  const blocked = guardDemoMode(session!.user.id);
  if (blocked) return { success: false, error: blocked.error };

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

  // Fire-and-forget investment sync — skips silently if item has no investment accounts
  syncInvestments(plaidItemId, householdId, db).catch(() => {});

  revalidatePath("/");
  revalidatePath("/accounts");
  revalidatePath("/transactions");
  revalidatePath("/investments");

  return result;
}
