"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/auth/authorize-action";
import { upsertUserSetting } from "@/queries/user-settings";
import type { LedgrDb } from "@/db";
import { revokeConsent } from "@/lib/mcp/auth/oauth-server";

export async function upsertMcpEnabled(
  userId: string,
  mcpEnabled: boolean,
  txDb?: LedgrDb,
): Promise<void> {
  await upsertUserSetting(userId, { mcpEnabled }, txDb);
}

const toggleMcpSchema = z.object({
  mcpEnabled: z.boolean(),
});

export async function toggleMcpEndpoint(
  input: z.infer<typeof toggleMcpSchema>,
): Promise<{ success: true } | { error: string }> {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;

  const parsed = toggleMcpSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await upsertMcpEnabled(auth.userId, parsed.data.mcpEnabled);

  revalidatePath("/settings");
  return { success: true };
}

const revokeClientSchema = z.object({
  clientId: z.string().min(1),
});

export async function revokeMcpClient(
  input: z.infer<typeof revokeClientSchema>,
): Promise<{ success: true } | { error: string }> {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;

  const parsed = revokeClientSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await revokeConsent(auth.userId, parsed.data.clientId);

  revalidatePath("/settings");
  return { success: true };
}
