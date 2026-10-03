import { NextResponse } from "next/server";
import { getHouseholdId } from "@/lib/auth/session";
import { withHousehold } from "@/lib/household-context";
import { getToolAccounts } from "@/queries/accounts";

/**
 * Read-only account data for trusted local finance tools.
 * Balance fields are signed integer cents.
 */
export async function GET() {
  const householdId = await getHouseholdId();
  const accounts = await withHousehold(householdId, (tx) =>
    getToolAccounts(householdId, tx),
  );

  return NextResponse.json(
    { accounts },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
