"use server";

import { authorizeAction } from "@/lib/auth/authorize-action";
import { saveLayoutForUser } from "@/actions/settings";
import type { DashboardLayout } from "@/components/organisms/widgets/registry";

export async function saveLayout(
  layout: DashboardLayout,
): Promise<void> {
  const auth = await authorizeAction();
  if ("error" in auth) return;
  await saveLayoutForUser(auth.userId, layout);
}
