import { eq } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { userSettings } from "@/db/schema";

export const DEMO_HOUSEHOLD_ID = "00000000-0000-0000-0000-000000000000";

export function isDemoMode(userId: string, db: LedgrDb = defaultDb): boolean {
  const row = db
    .select({ demoMode: userSettings.demoMode })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();
  return row?.demoMode === true;
}

export function guardDemoMode(
  userId: string,
  db: LedgrDb = defaultDb,
): { error: string } | null {
  if (isDemoMode(userId, db)) {
    return { error: "Demo mode is read-only. Switch to your account to make changes." };
  }
  return null;
}
