"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { CountryCode } from "plaid";
import { getPlaidClient } from "@/lib/plaid/client";
import { extractPlaidErrorMessage } from "@/lib/plaid/utils";
import { decrypt } from "@/lib/encryption";
import { authorizeAction } from "@/lib/auth/authorize-action";
import { scopedQuery } from "@/lib/scoped-query";
import { db as defaultDb, type LedgrDb } from "@/db";
import { bankConnections } from "@/db/schema";
import { syncInstitution } from "@/lib/plaid/sync";

export async function createUpdateLinkTokenDirect(
  plaidItemId: string,
  householdId: string,
  db: LedgrDb = defaultDb,
) {
  const scoped = scopedQuery(householdId, db);
  const [item] = await db
    .select({ credential: bankConnections.credential, status: bankConnections.status })
    .from(bankConnections)
    .where(scoped.where(bankConnections, eq(bankConnections.id, plaidItemId)))
    .limit(1);

  if (!item) {
    return { error: "Institution not found" };
  }

  if (item.status !== "reauth_required") {
    return { error: "Institution does not require re-authentication" };
  }

  try {
    const accessToken = decrypt(item.credential);
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
  const auth = await authorizeAction();
  if ("error" in auth) return auth;

  return createUpdateLinkTokenDirect(plaidItemId, auth.householdId);
}

export async function completeReAuthDirect(
  plaidItemId: string,
  householdId: string,
  db: LedgrDb = defaultDb,
) {
  const scoped = scopedQuery(householdId, db);
  const [item] = await db
    .select({ credential: bankConnections.credential, status: bankConnections.status })
    .from(bankConnections)
    .where(scoped.where(bankConnections, eq(bankConnections.id, plaidItemId)))
    .limit(1);

  if (!item) {
    return { error: "Institution not found" };
  }

  if (item.status !== "reauth_required") {
    return { error: "Institution does not require re-authentication" };
  }

  try {
    const accessToken = decrypt(item.credential);
    const itemRes = await getPlaidClient().itemGet({ access_token: accessToken });

    if (itemRes.data.item.error) {
      return { error: "Bank connection still requires re-authentication" };
    }

    await db.update(bankConnections)
      .set({ status: "active", errorCode: null, updatedAt: new Date() })
      .where(scoped.where(bankConnections, eq(bankConnections.id, plaidItemId)));

    await syncInstitution(plaidItemId, householdId, db);

    return { success: true };
  } catch (e: unknown) {
    console.error("Re-auth completion failed:", e);
    return { error: "Re-authentication verification failed" };
  }
}

export async function completeReAuth(plaidItemId: string) {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;

  const result = await completeReAuthDirect(plaidItemId, auth.householdId);
  if ("success" in result && result.success) {
    revalidatePath("/accounts");
  }
  return result;
}
