import { eq } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  plaidItems,
  accounts,
  recurringTransactions,
  households,
  user,
  userSettings,
  oauthCodes,
  oauthRefreshTokens,
  oauthConsents,
} from "@/db/schema";
import { decrypt } from "@/lib/encryption";
import { getPlaidClient } from "@/lib/plaid/client";

/**
 * Full erasure of a household's financial data and (optionally) the owning user.
 *
 * These back the user-facing "Danger zone" actions in Settings and give Ledgr a
 * true data-deletion capability (as opposed to soft-delete on Plaid disconnect).
 *
 * Deletion order is driven by the schema's `onDelete` rules rather than hardcoded
 * here: household-scoped tables cascade from `households`, and cross-reference FKs
 * (accounts→plaid_items, transactions→categories/merchants/recurring, splits and
 * budget_categories→categories, etc.) carry explicit set-null/cascade rules, so
 * Postgres resolves the graph in a single statement.
 */
export type DeletionDeps = {
  db?: LedgrDb;
  /**
   * Revoke a Plaid item at Plaid, given its (encrypted) access token. Injectable
   * for tests. The default decrypts and calls Plaid's `/item/remove`.
   */
  revokePlaidItem?: (encryptedAccessToken: string) => Promise<void>;
};

const defaultRevoke = async (encryptedAccessToken: string): Promise<void> => {
  await getPlaidClient().itemRemove({
    access_token: decrypt(encryptedAccessToken),
  });
};

/** Revoke every Plaid item for a household. Best-effort — a Plaid failure must not
 * block local erasure (the user still expects their data gone). */
async function revokeAllPlaidItems(
  db: LedgrDb,
  householdId: string,
  revoke: (token: string) => Promise<void>,
): Promise<void> {
  const items = await db
    .select({ accessToken: plaidItems.accessToken })
    .from(plaidItems)
    .where(eq(plaidItems.householdId, householdId));

  for (const item of items) {
    try {
      await revoke(item.accessToken);
    } catch {
      // Best-effort: continue local cleanup even if Plaid rejects the call.
    }
  }
}

/**
 * Erase all financial data for a household while keeping the user's login,
 * custom categories, and budgets.
 *
 * Deleting `accounts` cascades their transactions (and splits), investment
 * holdings/history/transactions, and balance history; deleting `plaid_items`
 * cascades sync logs and institution logos. Recurring streams are household-scoped
 * (not account-cascaded) so they are removed explicitly.
 */
export async function deleteFinancialData(
  householdId: string,
  deps: DeletionDeps = {},
): Promise<void> {
  const db = deps.db ?? defaultDb;
  const revoke = deps.revokePlaidItem ?? defaultRevoke;

  await revokeAllPlaidItems(db, householdId, revoke);
  await db.transaction(async (tx) => {
    await tx.delete(accounts).where(eq(accounts.householdId, householdId));
    await tx.delete(plaidItems).where(eq(plaidItems.householdId, householdId));
    await tx
      .delete(recurringTransactions)
      .where(eq(recurringTransactions.householdId, householdId));
  });
}

/**
 * Permanently erase everything: the household and all of its data, plus the user
 * and their login artifacts.
 *
 * Deleting the `households` row cascades every household-scoped table in one
 * statement (accounts→transactions/investments/balances, categories, budgets,
 * merchants, plaid items, recurring, saved reports, memberships). OAuth grants and
 * user settings store ids without FKs, so they are cleaned up explicitly; deleting
 * the `user` row cascades to sessions and auth accounts.
 */
export async function deleteAccount(
  householdId: string,
  userId: string,
  deps: DeletionDeps = {},
): Promise<void> {
  const db = deps.db ?? defaultDb;
  const revoke = deps.revokePlaidItem ?? defaultRevoke;

  await revokeAllPlaidItems(db, householdId, revoke);

  await db.transaction(async (tx) => {
    await tx.delete(households).where(eq(households.id, householdId));

    await tx.delete(oauthCodes).where(eq(oauthCodes.userId, userId));
    await tx.delete(oauthRefreshTokens).where(eq(oauthRefreshTokens.userId, userId));
    await tx.delete(oauthConsents).where(eq(oauthConsents.userId, userId));
    await tx.delete(userSettings).where(eq(userSettings.userId, userId));

    await tx.delete(user).where(eq(user.id, userId));
  });
}
