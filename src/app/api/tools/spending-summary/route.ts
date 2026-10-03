import { NextResponse } from "next/server";
import { getHouseholdId } from "@/lib/auth/session";
import { withHousehold } from "@/lib/household-context";
import { parseToolSpendingSummaryParams } from "@/lib/tools/spending-summary-params";
import { getToolSpendingSummary } from "@/queries/reports";

/**
 * Read-only spending totals using the canonical Spending report semantics.
 * All amounts are positive integer cents.
 */
export async function GET(request: Request) {
  const parsed = parseToolSpendingSummaryParams(
    new URL(request.url).searchParams,
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", message: parsed.message },
      { status: 400 },
    );
  }

  const householdId = await getHouseholdId();
  const summary = await withHousehold(householdId, (tx) =>
    getToolSpendingSummary(householdId, parsed.data, tx),
  );

  return NextResponse.json(summary, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
