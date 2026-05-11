"use server";

import { authorizeAction } from "@/lib/auth/authorize-action";
import { upsertUserSetting } from "@/queries/user-settings";
import type { LedgrDb } from "@/db";
import type { DashboardLayout } from "@/components/organisms/widgets/registry";

export async function saveLayoutForUser(
  userId: string,
  layout: DashboardLayout,
  txDb?: LedgrDb,
): Promise<void> {
  await upsertUserSetting(userId, { dashboardLayout: JSON.stringify(layout) }, txDb);
}

export async function saveLayout(
  layout: DashboardLayout,
): Promise<void> {
  const auth = await authorizeAction();
  if ("error" in auth) return;
  await saveLayoutForUser(auth.userId, layout);
}
