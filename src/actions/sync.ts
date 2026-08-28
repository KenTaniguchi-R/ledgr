"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/auth/authorize-action";
import { scopedQuery } from "@/lib/scoped-query";
import { db as defaultDb, type LedgrDb } from "@/db";
import { bankConnections } from "@/db/schema";
import { syncInstitution } from "@/lib/plaid/sync";
import { syncInvestments } from "@/lib/plaid/investments";
import { syncConnection } from "@/lib/simplefin/sync";
import type { SyncResult as PlaidSyncResult } from "@/lib/plaid/sync";
import type { SyncResult as SimplefinSyncResult } from "@/lib/simplefin/sync";

export async function triggerSync(
  connectionId: string,
  db: LedgrDb = defaultDb
): Promise<PlaidSyncResult | SimplefinSyncResult> {
  const auth = await authorizeAction();
  if ("error" in auth) return { success: false, error: auth.error };
  const { householdId } = auth;

  const scoped = scopedQuery(householdId, db);

  const [item] = await db
    .select({ id: bankConnections.id, provider: bankConnections.provider })
    .from(bankConnections)
    .where(scoped.where(bankConnections, eq(bankConnections.id, connectionId)))
    .limit(1);

  if (!item) {
    return { success: false, error: "Institution not found" };
  }

  const result =
    item.provider === "simplefin"
      ? await syncConnection(connectionId, householdId, db)
      : await syncInstitution(connectionId, householdId, db);

  if (item.provider === "plaid") {
    // Fire-and-forget investment sync — skips silently if item has no investment accounts
    syncInvestments(connectionId, householdId, db).catch((err) => {
      console.error("[sync] investment sync failed", err);
    });
  }

  revalidatePath("/");
  revalidatePath("/accounts");
  revalidatePath("/transactions");
  revalidatePath("/investments");

  return result;
}
