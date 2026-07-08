"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/auth/authorize-action";
import {
  deleteFinancialData,
  deleteAccount,
} from "@/lib/account-deletion";

/**
 * Erase all connected-account financial data for the current household while
 * keeping the user's login, categories, and budgets.
 */
export async function deleteFinancialDataAction() {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;

  await deleteFinancialData(auth.householdId);

  revalidatePath("/");
  revalidatePath("/accounts");
  revalidatePath("/transactions");
  revalidatePath("/investments");
  revalidatePath("/reports");
  return { success: true as const };
}

/**
 * Permanently delete the current user's account and all associated data. The
 * caller is responsible for signing out afterward (the session row is erased as
 * part of this, but the client cookie should be cleared too).
 */
export async function deleteAccountAction() {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;

  await deleteAccount(auth.householdId, auth.userId);
  return { success: true as const };
}
