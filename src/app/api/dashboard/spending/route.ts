import { NextRequest, NextResponse } from "next/server";
import { getHouseholdId } from "@/lib/auth/session";
import { withHousehold } from "@/lib/household-context";
import { getMonthlySpending } from "@/queries/dashboard";

export async function GET(request: NextRequest) {
  const householdId = await getHouseholdId();
  const month = request.nextUrl.searchParams.get("month") ?? undefined;
  const data = await withHousehold(householdId, (tx) => getMonthlySpending(householdId, month, tx));
  return NextResponse.json(data);
}
