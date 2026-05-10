"use server";

import { v4 as uuid } from "uuid";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { Products, CountryCode } from "plaid";
import { getPlaidClient } from "@/lib/plaid/client";
import { encrypt, decrypt } from "@/lib/encryption";
import { plaidAmountToCents } from "@/lib/money";
import { mapPlaidAccountType, todayISO, extractPlaidErrorCode, extractPlaidErrorMessage } from "@/lib/plaid/utils";
import { getSession, getHouseholdId } from "@/lib/auth/session";
import { db as defaultDb, type LedgrDb } from "@/db";
import { plaidItems, accounts, balanceHistory, institutionLogos } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";

export async function createLinkToken() {
  await getHouseholdId();
  const session = await getSession();

  try {
    const response = await getPlaidClient().linkTokenCreate({
      user: { client_user_id: session!.user.id },
      client_name: "Ledgr",
      products: [Products.Transactions, Products.Investments],
      country_codes: [CountryCode.Us],
      language: "en",
      ...(process.env.PLAID_WEBHOOK_URL
        ? { webhook: process.env.PLAID_WEBHOOK_URL }
        : {}),
      ...(process.env.PLAID_OAUTH_REDIRECT_URI
        ? { redirect_uri: process.env.PLAID_OAUTH_REDIRECT_URI }
        : {}),
    });
    return { linkToken: response.data.link_token };
  } catch (e: unknown) {
    console.error("Failed to create link token:", e);
    return { error: extractPlaidErrorMessage(e) ?? "Failed to initialize bank connection" };
  }
}

export async function exchangeAndStoreAccounts(
  publicToken: string,
  householdId: string,
  db: LedgrDb = defaultDb
): Promise<
  | { success: true; accountCount: number; error?: never }
  | { success: false; error: string; accountCount?: never }
> {
  try {
    const exchangeRes = await getPlaidClient().itemPublicTokenExchange({
      public_token: publicToken,
    });
    const accessToken = exchangeRes.data.access_token;

    const itemRes = await getPlaidClient().itemGet({ access_token: accessToken });
    const institutionId = itemRes.data.item.institution_id ?? null;

    let institutionName = "Unknown Institution";
    let institutionLogo: string | null = null;
    let institutionPrimaryColor: string | null = null;
    if (institutionId) {
      try {
        const instRes = await getPlaidClient().institutionsGetById({
          institution_id: institutionId,
          country_codes: [CountryCode.Us],
          options: { include_optional_metadata: true },
        });
        institutionName = instRes.data.institution.name;
        institutionLogo = instRes.data.institution.logo ?? null;
        institutionPrimaryColor = instRes.data.institution.primary_color ?? null;
      } catch {
        // Fall back to "Unknown Institution" if lookup fails
      }
    }

    if (institutionId) {
      const existing = db
        .select({ id: plaidItems.id })
        .from(plaidItems)
        .where(
          and(
            eq(plaidItems.householdId, householdId),
            eq(plaidItems.plaidInstitutionId, institutionId)
          )
        )
        .get();
      if (existing) {
        return { success: false, error: "This institution is already connected" };
      }
    }

    const accountsRes = await getPlaidClient().accountsGet({
      access_token: accessToken,
    });
    const plaidAccounts = accountsRes.data.accounts;

    const plaidItemId = uuid();
    const today = todayISO();

    db.transaction((tx) => {
      tx.insert(plaidItems)
        .values({
          id: plaidItemId,
          householdId,
          accessToken: encrypt(accessToken),
          plaidInstitutionId: institutionId,
          plaidItemId: itemRes.data.item.item_id,
          institutionName,
          primaryColor: institutionPrimaryColor,
          status: "active",
        })
        .run();

      if (institutionLogo) {
        tx.insert(institutionLogos)
          .values({
            id: uuid(),
            plaidItemId: plaidItemId,
            logo: institutionLogo,
          })
          .run();
      }

      for (const acct of plaidAccounts) {
        const accountId = uuid();
        const currentBalance = plaidAmountToCents(acct.balances.current ?? null);
        const availableBalance = plaidAmountToCents(
          acct.balances.available ?? null
        );
        const creditLimit = plaidAmountToCents(acct.balances.limit ?? null);

        tx.insert(accounts)
          .values({
            id: accountId,
            householdId,
            plaidItemId,
            plaidAccountId: acct.account_id,
            name: acct.name,
            officialName: acct.official_name ?? null,
            type: mapPlaidAccountType(acct.type, acct.subtype ?? null),
            subtype: acct.subtype ?? null,
            currentBalance,
            availableBalance,
            creditLimit,
            currency: acct.balances.iso_currency_code ?? "USD",
          })
          .run();

        if (currentBalance !== null) {
          tx.insert(balanceHistory)
            .values({
              id: uuid(),
              accountId,
              date: today,
              balance: currentBalance,
            })
            .run();
        }
      }
    });

    return { success: true, accountCount: plaidAccounts.length };
  } catch (e: unknown) {
    console.error("Exchange failed:", e);
    const errorCode = extractPlaidErrorCode(e);
    if (
      errorCode === "INSTITUTION_DOWN" ||
      errorCode === "INSTITUTION_NOT_RESPONDING"
    ) {
      return {
        success: false,
        error: "This bank is temporarily unavailable. Please try again later.",
      };
    }
    return { success: false, error: "Failed to connect account" };
  }
}

export async function exchangePublicToken(publicToken: string) {
  const householdId = await getHouseholdId();
  const result = await exchangeAndStoreAccounts(publicToken, householdId);
  if (result.success) {
    revalidatePath("/accounts");
  }
  return result;
}

export async function disconnectPlaidItem(
  plaidItemId: string,
  db: LedgrDb = defaultDb,
) {
  const householdId = await getHouseholdId();
  const scoped = scopedQuery(householdId, db);

  const item = db
    .select({
      id: plaidItems.id,
      accessToken: plaidItems.accessToken,
    })
    .from(plaidItems)
    .where(scoped.where(plaidItems, eq(plaidItems.id, plaidItemId)))
    .get();

  if (!item) {
    return { error: "Item not found" };
  }

  try {
    await getPlaidClient().itemRemove({
      access_token: decrypt(item.accessToken),
    });
  } catch {
    // Best-effort — continue with local cleanup even if Plaid call fails
  }

  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(accounts)
      .set({ deletedAt: now, plaidItemId: null, plaidAccountId: null })
      .where(eq(accounts.plaidItemId, plaidItemId))
      .run();

    tx.delete(plaidItems)
      .where(eq(plaidItems.id, plaidItemId))
      .run();
  });

  revalidatePath("/accounts");
  revalidatePath("/investments");
  return { success: true };
}
