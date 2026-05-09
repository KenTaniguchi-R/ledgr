import { cache } from "react";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { householdMembers } from "@/db/schema";
import { provisionHousehold } from "./provision";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

type LedgrDb = BetterSQLite3Database<typeof schema>;

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export function resolveHouseholdId(
  userId: string,
  db: LedgrDb = defaultDb
): string {
  const member = db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .get();

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

  try {
    return resolveHouseholdId(session.user.id);
  } catch (e) {
    console.error("Self-heal provisioning failed:", e);
    throw new Error("Failed to provision household");
  }
});
