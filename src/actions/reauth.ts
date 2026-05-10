"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { CountryCode } from "plaid";
import { getPlaidClient } from "@/lib/plaid/client";
import { decrypt } from "@/lib/encryption";
import { getHouseholdId } from "@/lib/auth/session";
import { db as defaultDb, type LedgrDb } from "@/db";
import { plaidItems } from "@/db/schema";
import { syncInstitution } from "@/lib/plaid/sync";

export async function createUpdateLinkTokenDirect(
  plaidItemId: string,
  householdId: string,
  db: LedgrDb = defaultDb,
) {
  const item = db
    .select()
    .from(plaidItems)
    .where(and(eq(plaidItems.id, plaidItemId), eq(plaidItems.householdId, householdId)))
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
    const plaidErr = e as { response?: { data?: { error_message?: string } } };
    console.error("Failed to create update link token:", plaidErr?.response?.data ?? e);
    return { error: plaidErr?.response?.data?.error_message ?? "Failed to initialize re-authentication" };
  }
}

export async function createUpdateLinkToken(plaidItemId: string) {
  const householdId = await getHouseholdId();
  return createUpdateLinkTokenDirect(plaidItemId, householdId);
}

export async function completeReAuthDirect(
  plaidItemId: string,
  householdId: string,
  db: LedgrDb = defaultDb,
) {
  const item = db
    .select()
    .from(plaidItems)
    .where(and(eq(plaidItems.id, plaidItemId), eq(plaidItems.householdId, householdId)))
    .get();

  if (!item) {
    return { error: "Institution not found" };
  }

  if (item.status !== "reauth_required") {
    return { error: "Institution does not require re-authentication" };
  }

  try {
    const accessToken = decrypt(item.accessToken);
    await getPlaidClient().itemGet({ access_token: accessToken });

    db.update(plaidItems)
      .set({ status: "active", errorCode: null, updatedAt: new Date().toISOString() })
      .where(eq(plaidItems.id, plaidItemId))
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
  const result = await completeReAuthDirect(plaidItemId, householdId);
  if ("success" in result && result.success) {
    revalidatePath("/accounts");
  }
  return result;
}
