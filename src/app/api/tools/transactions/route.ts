import { NextResponse } from "next/server";
import { getHouseholdId } from "@/lib/auth/session";
import { withHousehold } from "@/lib/household-context";
import { parseToolTransactionParams } from "@/lib/tools/transaction-params";
import { getToolTransactions } from "@/queries/transactions";

/**
 * Read-only transaction facts for trusted local finance tools.
 * Amounts are signed integer cents using normalizedAmount's display convention.
 */
export async function GET(request: Request) {
  const parsed = parseToolTransactionParams(new URL(request.url).searchParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", message: parsed.message },
      { status: 400 },
    );
  }

  const householdId = await getHouseholdId();
  const { filters, limit, cursor } = parsed.data;
  const page = await withHousehold(householdId, (tx) =>
    getToolTransactions(householdId, filters, limit, cursor, tx),
  );

  return NextResponse.json(page, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
