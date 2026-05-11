"use server";

import { getHouseholdId } from "@/lib/auth/session";
import { getInvestmentTransactions, type InvestmentFilters } from "@/queries/investments";

export async function loadMoreInvestmentTransactions(
  cursor: string,
  filters: InvestmentFilters = {},
) {
  const householdId = await getHouseholdId();
  return getInvestmentTransactions(householdId, filters, 50, cursor);
}
