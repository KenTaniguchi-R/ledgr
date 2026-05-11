"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { guardDemoMode } from "@/lib/demo-mode";
import { upsertMcpEnabled } from "@/queries/settings";
import { revokeConsent } from "@/lib/mcp/auth/oauth-server";

const toggleMcpSchema = z.object({
  mcpEnabled: z.boolean(),
});

export async function toggleMcpEndpoint(
  input: z.infer<typeof toggleMcpSchema>,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const blocked = guardDemoMode(session.user.id);
  if (blocked) return blocked;

  const parsed = toggleMcpSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  upsertMcpEnabled(session.user.id, parsed.data.mcpEnabled);

  revalidatePath("/settings");
  return { success: true };
}

const revokeClientSchema = z.object({
  clientId: z.string().min(1),
});

export async function revokeMcpClient(
  input: z.infer<typeof revokeClientSchema>,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const blocked = guardDemoMode(session.user.id);
  if (blocked) return blocked;

  const parsed = revokeClientSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  revokeConsent(session.user.id, parsed.data.clientId);

  revalidatePath("/settings");
  return { success: true };
}
