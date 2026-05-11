"use server";

import { getSession } from "@/lib/auth/session";
import { guardDemoMode } from "@/lib/demo-mode";
import { saveLayoutForUser, getLayoutForUser } from "@/actions/settings";
import type { DashboardLayout } from "@/components/organisms/widgets/registry";

export async function saveLayout(
  layout: DashboardLayout,
): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  const blocked = guardDemoMode(session.user.id);
  if (blocked) return;
  await saveLayoutForUser(session.user.id, layout);
}

export async function getLayout(): Promise<DashboardLayout | null> {
  const session = await getSession();
  if (!session) return null;
  return getLayoutForUser(session.user.id);
}
