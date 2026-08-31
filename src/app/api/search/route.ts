import { NextResponse } from "next/server";
import { getHouseholdId } from "@/lib/auth/session";
import { withHousehold } from "@/lib/household-context";
import { getTransactions } from "@/queries/transactions";
import { getAccounts } from "@/queries/accounts";
import { accountDisplayName } from "@/lib/account-name";

/**
 * Backs the command palette. Deliberately small: it answers "where is this
 * thing" for the two entities people look one up by — a transaction and an
 * account — rather than trying to be a second Transactions page.
 */

const MAX_TRANSACTIONS = 6;
const MAX_ACCOUNTS = 4;
/** Below this, results are mostly noise and the query is still being typed. */
const MIN_QUERY_LENGTH = 2;

export interface SearchResults {
  transactions: {
    id: string;
    name: string;
    date: string;
    normalizedAmount: number;
    currency: string;
    categoryName: string | null;
  }[];
  accounts: { id: string; name: string; type: string }[];
}

export async function GET(request: Request) {
  const householdId = await getHouseholdId();
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ transactions: [], accounts: [] } satisfies SearchResults);
  }

  const [page, allAccounts] = await Promise.all([
    withHousehold(householdId, (tx) =>
      getTransactions(householdId, { search: query }, undefined, undefined, tx),
    ),
    getAccounts(householdId),
  ]);

  const needle = query.toLowerCase();

  return NextResponse.json({
    transactions: page.rows.slice(0, MAX_TRANSACTIONS).map((t) => ({
      id: t.id,
      name: t.merchantName ?? t.name,
      date: t.date,
      normalizedAmount: t.normalizedAmount,
      currency: t.currency,
      categoryName: t.categoryName ?? null,
    })),
    accounts: allAccounts
      .filter((a) => !a.isHidden)
      // Matched against the display name, so what the user typed lines up with
      // what they saw on screen — the stored name can carry a duplicated mask.
      .filter((a) => accountDisplayName(a.name).toLowerCase().includes(needle))
      .slice(0, MAX_ACCOUNTS)
      .map((a) => ({ id: a.id, name: accountDisplayName(a.name), type: a.type })),
  } satisfies SearchResults);
}
