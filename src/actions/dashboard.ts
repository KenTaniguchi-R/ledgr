"use server";

import { getSession } from "@/lib/auth/session";
import { saveLayoutForUser, getLayoutForUser } from "@/queries/settings";
import type { DashboardLayout } from "@/components/organisms/widgets/registry";

export async function saveLayout(
  layout: DashboardLayout,
): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  saveLayoutForUser(session.user.id, layout);
}

export async function getLayout(): Promise<DashboardLayout | null> {
  const session = await getSession();
  if (!session) return null;
  return getLayoutForUser(session.user.id);
}
