"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/auth/authorize-action";
import { scopedQuery } from "@/lib/scoped-query";
import { db as defaultDb, type LedgrDb } from "@/db";
import { plaidItems } from "@/db/schema";
import { syncInstitution, type SyncResult } from "@/lib/plaid/sync";
import { syncInvestments } from "@/lib/plaid/investments";

export async function triggerSync(
  plaidItemId: string,
  db: LedgrDb = defaultDb
): Promise<SyncResult> {
  const auth = await authorizeAction();
  if ("error" in auth) return { success: false, error: auth.error };
  const { householdId } = auth;

  const scoped = scopedQuery(householdId, db);

  const [item] = await db
    .select({ id: plaidItems.id })
    .from(plaidItems)
    .where(scoped.where(plaidItems, eq(plaidItems.id, plaidItemId)))
    .limit(1);

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
