"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { CountryCode } from "plaid";
import { getPlaidClient } from "@/lib/plaid/client";
import { extractPlaidErrorMessage } from "@/lib/plaid/utils";
import { nowISO } from "@/lib/date-utils";
import { decrypt } from "@/lib/encryption";
import { getHouseholdId, getSession } from "@/lib/auth/session";
import { guardDemoMode } from "@/lib/demo-mode";
import { scopedQuery } from "@/lib/scoped-query";
import { db as defaultDb, type LedgrDb } from "@/db";
import { plaidItems } from "@/db/schema";
import { syncInstitution } from "@/lib/plaid/sync";

export async function createUpdateLinkTokenDirect(
  plaidItemId: string,
  householdId: string,
  db: LedgrDb = defaultDb,
) {
  const scoped = scopedQuery(householdId, db);
  const item = db
    .select({ accessToken: plaidItems.accessToken, status: plaidItems.status })
    .from(plaidItems)
    .where(scoped.where(plaidItems, eq(plaidItems.id, plaidItemId)))
    .get();

  if (!item) {
    return { error: "Institution not found" };
  }

  if (item.status !== "reauth_required") {
    return { error: "Institution does not require re-authentication" };
  }

  try {
    const accessToken = decrypt(item.accessToken);
    const response = await getPlaidClient().linkTokenCreate({
      access_token: accessToken,
      client_name: "Ledgr",
      language: "en",
      country_codes: [CountryCode.Us],
      user: { client_user_id: householdId },
    });
    return { linkToken: response.data.link_token };
  } catch (e: unknown) {
    console.error("Failed to create update link token:", e);
    return { error: extractPlaidErrorMessage(e) ?? "Failed to initialize re-authentication" };
  }
}

export async function createUpdateLinkToken(plaidItemId: string) {
  const householdId = await getHouseholdId();
  const session = await getSession();
  const blocked = guardDemoMode(session!.user.id);
  if (blocked) return blocked;

  return createUpdateLinkTokenDirect(plaidItemId, householdId);
}

export async function completeReAuthDirect(
  plaidItemId: string,
  householdId: string,
  db: LedgrDb = defaultDb,
) {
  const scoped = scopedQuery(householdId, db);
  const item = db
    .select({ accessToken: plaidItems.accessToken, status: plaidItems.status })
    .from(plaidItems)
    .where(scoped.where(plaidItems, eq(plaidItems.id, plaidItemId)))
    .get();

  if (!item) {
    return { error: "Institution not found" };
  }

  if (item.status !== "reauth_required") {
    return { error: "Institution does not require re-authentication" };
  }

  try {
    const accessToken = decrypt(item.accessToken);
    const itemRes = await getPlaidClient().itemGet({ access_token: accessToken });

    if (itemRes.data.item.error) {
      return { error: "Bank connection still requires re-authentication" };
    }

    db.update(plaidItems)
      .set({ status: "active", errorCode: null, updatedAt: nowISO() })
      .where(scoped.where(plaidItems, eq(plaidItems.id, plaidItemId)))
      .run();

    await syncInstitution(plaidItemId, householdId, db);

    return { success: true };
  } catch (e: unknown) {
    console.error("Re-auth completion failed:", e);
    return { error: "Re-authentication verification failed" };
  }
}

export async function completeReAuth(plaidItemId: string) {
  const householdId = await getHouseholdId();
  const session = await getSession();
  const blocked = guardDemoMode(session!.user.id);
  if (blocked) return blocked;

  const result = await completeReAuthDirect(plaidItemId, householdId);
  if ("success" in result && result.success) {
    revalidatePath("/accounts");
  }
  return result;
}
