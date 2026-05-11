import { cache } from "react";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { householdMembers } from "@/db/schema";
import { provisionHousehold } from "./provision";
import { isDemoMode, DEMO_HOUSEHOLD_ID } from "@/lib/demo-mode";

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export async function resolveHouseholdId(
  userId: string,
  db: LedgrDb = defaultDb
): Promise<string> {
  const [member] = await db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .limit(1);

  if (member) {
    return member.householdId;
  }

  return provisionHousehold(userId, db);
}

export const getHouseholdId = cache(async (): Promise<string> => {
  const session = await getSession();
  if (!session) {
    throw new Error("Not authenticated");
  }

  if (await isDemoMode(session.user.id)) {
    return DEMO_HOUSEHOLD_ID;
  }

  try {
    return resolveHouseholdId(session.user.id);
  } catch (e) {
    console.error("Self-heal provisioning failed:", e);
    throw new Error("Failed to provision household");
  }
});
