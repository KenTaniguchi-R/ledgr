"use server";

import { v4 as uuid } from "uuid";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Products, CountryCode } from "plaid";
import { plaidClient } from "@/lib/plaid/client";
import { encryptAccessToken } from "@/lib/plaid/token";
import { plaidAmountToCents } from "@/lib/money";
import { mapPlaidAccountType, todayISO } from "@/lib/plaid/utils";
import { getSession, getHouseholdId } from "@/lib/auth/session";
import { db as defaultDb } from "@/db";
import { plaidItems, accounts, balanceHistory } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

type LedgrDb = BetterSQLite3Database<typeof schema>;

export async function createLinkToken() {
  await getHouseholdId();
  const session = await getSession();
  if (!session) {
    return { error: "Not authenticated" };
  }

  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: session.user.id },
      client_name: "Ledgr",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
      ...(process.env.PLAID_WEBHOOK_URL
        ? { webhook: process.env.PLAID_WEBHOOK_URL }
        : {}),
      ...(process.env.NEXT_PUBLIC_APP_URL
        ? {
            redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/plaid/oauth-return`,
          }
        : {}),
    });
    return { linkToken: response.data.link_token };
  } catch (e) {
    console.error("Failed to create link token:", e);
    return { error: "Failed to initialize bank connection" };
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
    const exchangeRes = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });
    const accessToken = exchangeRes.data.access_token;

    const itemRes = await plaidClient.itemGet({ access_token: accessToken });
    const institutionId = itemRes.data.item.institution_id ?? null;

    let institutionName = "Unknown Institution";
    if (institutionId) {
      try {
        const instRes = await plaidClient.institutionsGetById({
          institution_id: institutionId,
          country_codes: [CountryCode.Us],
        });
        institutionName = instRes.data.institution.name;
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

    const accountsRes = await plaidClient.accountsGet({
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
          accessToken: encryptAccessToken(accessToken),
          plaidInstitutionId: institutionId,
          institutionName,
          status: "active",
        })
        .run();

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
    const plaidError = e as { response?: { data?: { error_code?: string } } };
    const errorCode = plaidError?.response?.data?.error_code;
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

const createManualAccountSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["checking", "savings", "credit", "loan", "investment", "other"]),
  balance: z.number().transform((v) => Math.round(v)),
});

type CreateManualAccountInput = {
  name: string;
  type: "checking" | "savings" | "credit" | "loan" | "investment" | "other";
  balance: number;
};

export async function createManualAccount(data: CreateManualAccountInput) {
  const householdId = await getHouseholdId();

  const parsed = createManualAccountSchema.safeParse(data);
  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  const accountId = uuid();
  const today = todayISO();

  defaultDb.transaction((tx) => {
    tx.insert(accounts)
      .values({
        id: accountId,
        householdId,
        name: parsed.data.name,
        type: parsed.data.type,
        currentBalance: parsed.data.balance,
        isManual: true,
      })
      .run();

    tx.insert(balanceHistory)
      .values({
        id: uuid(),
        accountId,
        date: today,
        balance: parsed.data.balance,
      })
      .run();
  });

  revalidatePath("/accounts");
  return { success: true, accountId };
}

const updateAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isHidden: z.boolean().optional(),
});

type UpdateAccountInput = {
  name?: string;
  isHidden?: boolean;
};

export async function updateAccount(accountId: string, data: UpdateAccountInput) {
  const householdId = await getHouseholdId();

  const parsed = updateAccountSchema.safeParse(data);
  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  const scoped = scopedQuery(householdId);
  const existing = defaultDb
    .select({ id: accounts.id })
    .from(accounts)
    .where(scoped.where(accounts, eq(accounts.id, accountId)))
    .get();

  if (!existing) {
    return { error: "Account not found" };
  }

  const updates: Partial<typeof accounts.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.isHidden !== undefined) updates.isHidden = parsed.data.isHidden;

  if (Object.keys(updates).length > 0) {
    defaultDb
      .update(accounts)
      .set(updates)
      .where(eq(accounts.id, accountId))
      .run();
  }

  revalidatePath("/accounts");
  return { success: true };
}
