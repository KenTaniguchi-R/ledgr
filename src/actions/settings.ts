"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { getSession } from "@/lib/auth/session";
import { db, type LedgrDb } from "@/db";
import { userSettings } from "@/db/schema";
import type { DashboardLayout } from "@/components/organisms/widgets/registry";

export async function upsertMcpEnabled(
  userId: string,
  mcpEnabled: boolean,
  txDb: LedgrDb = db,
): Promise<void> {
  const [existing] = await txDb
    .select({ id: userSettings.id })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const now = new Date();

  if (existing) {
    await txDb.update(userSettings)
      .set({ mcpEnabled, updatedAt: now })
      .where(eq(userSettings.id, existing.id));
  } else {
    await txDb.insert(userSettings).values({
      id: uuid(),
      userId,
      mcpEnabled,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function saveLayoutForUser(
  userId: string,
  layout: DashboardLayout,
  txDb: LedgrDb = db,
): Promise<void> {
  const layoutJson = JSON.stringify(layout);
  const [existing] = await txDb
    .select({ id: userSettings.id })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (existing) {
    await txDb.update(userSettings)
      .set({ dashboardLayout: layoutJson })
      .where(eq(userSettings.userId, userId));
  } else {
    await txDb.insert(userSettings)
      .values({ id: uuid(), userId, dashboardLayout: layoutJson });
  }
}

export async function toggleDemoMode(): Promise<{ success: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  const [existing] = await db
    .select({ id: userSettings.id, demoMode: userSettings.demoMode })
    .from(userSettings)
    .where(eq(userSettings.userId, session.user.id))
    .limit(1);

  if (existing) {
    await db.update(userSettings)
      .set({ demoMode: !existing.demoMode, updatedAt: new Date() })
      .where(eq(userSettings.id, existing.id));
  } else {
    await db.insert(userSettings)
      .values({ id: uuid(), userId: session.user.id, demoMode: true });
  }

  revalidatePath("/", "layout");
  return { success: true };
}
