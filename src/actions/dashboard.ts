"use server";

import { authorizeAction } from "@/lib/auth/authorize-action";
import { saveLayoutForUser } from "@/actions/settings";
import { getLayoutForUser } from "@/queries/settings";
import { getSession } from "@/lib/auth/session";
import type { DashboardLayout } from "@/components/organisms/widgets/registry";

export async function saveLayout(
  layout: DashboardLayout,
): Promise<void> {
  const auth = await authorizeAction();
  if ("error" in auth) return;
  await saveLayoutForUser(auth.userId, layout);
}

export async function getLayout(): Promise<DashboardLayout | null> {
  const session = await getSession();
  if (!session) return null;
  return await getLayoutForUser(session.user.id);
}
