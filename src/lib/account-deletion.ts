import { eq } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  plaidItems,
  accounts,
  transactions,
  recurringTransactions,
  budgets,
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
 */
export type DeletionDeps = {
  db?: LedgrDb;
  /**
   * Revoke a Plaid item at Plaid, given its (encrypted) access token. Injectable
   * for tests. The default decrypts and calls Plaid's `/item/remove`.
   */
  revokePlaidItem?: (encryptedAccessToken: string) => Promise<void>;
};

// A Drizzle transaction handle. Kept loose so the teardown helper works with both
// the top-level db and a transaction.
type Tx = Parameters<Parameters<LedgrDb["transaction"]>[0]>[0];

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
 * Delete the connected-account / transaction subtree for a household, in FK-safe
 * order. These tables carry NO ACTION cross-references (accounts→plaid_items,
 * transactions→recurring, recurring→accounts) so the order matters:
 *
 *   transactions (cascades transaction_splits)
 *   → recurring_transactions
 *   → accounts (cascades investment holdings/history/transactions + balance_history)
 *   → plaid_items (cascades sync logs + institution logos)
 */
async function deleteFinancialTables(tx: Tx, householdId: string): Promise<void> {
  await tx.delete(transactions).where(eq(transactions.householdId, householdId));
  await tx
    .delete(recurringTransactions)
    .where(eq(recurringTransactions.householdId, householdId));
  await tx.delete(accounts).where(eq(accounts.householdId, householdId));
  await tx.delete(plaidItems).where(eq(plaidItems.householdId, householdId));
}

/**
 * Erase all financial data for a household while keeping the user's login,
 * custom categories, and budgets.
 */
export async function deleteFinancialData(
  householdId: string,
  deps: DeletionDeps = {},
): Promise<void> {
  const db = deps.db ?? defaultDb;
  const revoke = deps.revokePlaidItem ?? defaultRevoke;

  await revokeAllPlaidItems(db, householdId, revoke);
  await db.transaction((tx) => deleteFinancialTables(tx, householdId));
}

/**
 * Permanently erase everything: the household and all of its data, plus the user
 * and their login artifacts.
 *
 * The transaction subtree and budgets are torn down first so that nothing still
 * references `categories`/`merchants` when the `households` row is deleted — those
 * back-references are NO ACTION and Postgres raises mid-cascade if a referencing
 * row (e.g. a transaction split or budget category) still exists. Once they're
 * gone, deleting `households` cleanly cascades categories, category groups/rules,
 * merchants, saved reports, and household memberships. OAuth grants and user
 * settings hold IDs without FKs, so they are removed explicitly; deleting the
 * `user` row cascades to sessions and auth accounts.
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
    await deleteFinancialTables(tx, householdId);
    // Removes budget_categories (which back-reference categories) before the
    // household cascade reaches categories.
    await tx.delete(budgets).where(eq(budgets.householdId, householdId));

    await tx.delete(households).where(eq(households.id, householdId));

    await tx.delete(oauthCodes).where(eq(oauthCodes.userId, userId));
    await tx.delete(oauthRefreshTokens).where(eq(oauthRefreshTokens.userId, userId));
    await tx.delete(oauthConsents).where(eq(oauthConsents.userId, userId));
    await tx.delete(userSettings).where(eq(userSettings.userId, userId));

    await tx.delete(user).where(eq(user.id, userId));
  });
}
