"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { upsertUserSetting } from "@/queries/user-settings";

export async function toggleDemoMode(): Promise<{ success: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  const [existing] = await db
    .select({ demoMode: userSettings.demoMode })
    .from(userSettings)
    .where(eq(userSettings.userId, session.user.id))
    .limit(1);

  await upsertUserSetting(session.user.id, { demoMode: !existing?.demoMode });

  revalidatePath("/", "layout");
  return { success: true };
}
