import { eq } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { userSettings } from "@/db/schema";

export const DEMO_HOUSEHOLD_ID = "00000000-0000-0000-0000-000000000000";

export async function isDemoMode(userId: string, db: LedgrDb = defaultDb): Promise<boolean> {
  const [row] = await db
    .select({ demoMode: userSettings.demoMode })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return row?.demoMode === true;
}

export async function guardDemoMode(
  userId: string,
  db: LedgrDb = defaultDb,
): Promise<{ error: string } | null> {
  if (await isDemoMode(userId, db)) {
    return { error: "Demo mode is read-only. Switch to your account to make changes." };
  }
  return null;
}
