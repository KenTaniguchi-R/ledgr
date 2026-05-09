import { cache } from "react";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { householdMembers } from "@/db/schema";
import { provisionHousehold } from "./provision";

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export const getHouseholdId = cache(async (): Promise<string> => {
  const session = await getSession();
  if (!session) {
    throw new Error("Not authenticated");
  }

  const member = db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, session.user.id))
    .get();

  if (member) {
    return member.householdId;
  }

  try {
    return provisionHousehold(session.user.id);
  } catch (e) {
    console.error("Self-heal provisioning failed:", e);
    throw new Error("Failed to provision household");
  }
});
