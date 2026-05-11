"use server";

import { getSession } from "@/lib/auth/session";
import { guardDemoMode } from "@/lib/demo-mode";
import { saveLayoutForUser } from "@/actions/settings";
import { getLayoutForUser } from "@/queries/settings";
import type { DashboardLayout } from "@/components/organisms/widgets/registry";

export async function saveLayout(
  layout: DashboardLayout,
): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  const blocked = await guardDemoMode(session.user.id);
  if (blocked) return;
  await saveLayoutForUser(session.user.id, layout);
}

export async function getLayout(): Promise<DashboardLayout | null> {
  const session = await getSession();
  if (!session) return null;
  return await getLayoutForUser(session.user.id);
}
