import { NextRequest, NextResponse } from "next/server";
import { getHouseholdId } from "@/lib/auth/session";
import { getNetWorthHistory } from "@/queries/dashboard";

const VALID_RANGES = ["1M", "3M", "6M", "1Y", "all"] as const;
type NetWorthRange = (typeof VALID_RANGES)[number];

function isValidRange(value: string): value is NetWorthRange {
  return (VALID_RANGES as readonly string[]).includes(value);
}

export async function GET(request: NextRequest) {
  const householdId = await getHouseholdId();
  const rawRange = request.nextUrl.searchParams.get("range") ?? "6M";
  const range: NetWorthRange = isValidRange(rawRange) ? rawRange : "6M";
  const data = getNetWorthHistory(householdId, range);
  return NextResponse.json(data);
}
