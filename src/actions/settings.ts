"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { getSession } from "@/lib/auth/session";
import { decrypt, encrypt } from "@/lib/encryption";
import { getUserAiSettings } from "@/queries/settings";
import { createUserModel, type AiProvider } from "@/lib/ai/provider";
import { generateText, stepCountIs } from "ai";
import { db, db as defaultDb, type LedgrDb } from "@/db";
import { userSettings } from "@/db/schema";
import { nowISO } from "@/lib/date-utils";
import type { DashboardLayout } from "@/components/organisms/widgets/registry";

const aiProviderEnum = z.enum(["openai", "anthropic", "google", "custom"]);

const updateAiSettingsSchema = z.object({
  aiProvider: aiProviderEnum,
  aiModel: z.string().min(1, "Model is required"),
  aiApiKey: z.string().optional(),
  aiBaseUrl: z.string().url().optional().or(z.literal("")),
  aiConfidenceThreshold: z.number().min(0.5).max(0.9).optional(),
});

const testAiConnectionSchema = z.object({
  aiProvider: aiProviderEnum,
  aiModel: z.string().min(1, "Model is required"),
  aiApiKey: z.string().optional(),
  aiBaseUrl: z.string().url().optional().or(z.literal("")),
});

export interface UpsertAiInput {
  aiProvider: string;
  aiModel: string;
  aiApiKey?: string;
  aiBaseUrl?: string;
  aiConfidenceThreshold?: number;
  toolCallingSupported?: boolean;
}

export async function upsertAiSettings(
  userId: string,
  input: UpsertAiInput,
  db: LedgrDb = defaultDb,
): Promise<void> {
  const [existing] = await db
    .select({ id: userSettings.id })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const now = nowISO();

  if (existing) {
    const updates: Record<string, unknown> = {
      aiProvider: input.aiProvider,
      aiModel: input.aiModel,
      updatedAt: now,
    };
    if (input.aiApiKey !== undefined) updates.aiApiKey = input.aiApiKey;
    if (input.aiBaseUrl !== undefined) updates.aiBaseUrl = input.aiBaseUrl;
    if (input.aiConfidenceThreshold !== undefined)
      updates.aiConfidenceThreshold = String(input.aiConfidenceThreshold);
    if (input.toolCallingSupported !== undefined)
      updates.toolCallingSupported = input.toolCallingSupported;

    await db.update(userSettings)
      .set(updates)
      .where(eq(userSettings.id, existing.id));
  } else {
    await db.insert(userSettings).values({
      id: uuid(),
      userId,
      aiProvider: input.aiProvider as "openai" | "anthropic" | "google" | "custom",
      aiModel: input.aiModel,
      aiApiKey: input.aiApiKey ?? null,
      aiBaseUrl: input.aiBaseUrl ?? null,
      aiConfidenceThreshold: input.aiConfidenceThreshold
        ? String(input.aiConfidenceThreshold)
        : "0.7",
      toolCallingSupported: input.toolCallingSupported ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function upsertMcpEnabled(
  userId: string,
  mcpEnabled: boolean,
  db: LedgrDb = defaultDb,
): Promise<void> {
  const [existing] = await db
    .select({ id: userSettings.id })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const now = nowISO();

  if (existing) {
    await db.update(userSettings)
      .set({ mcpEnabled, updatedAt: now })
      .where(eq(userSettings.id, existing.id));
  } else {
    await db.insert(userSettings).values({
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
  db: LedgrDb = defaultDb,
): Promise<void> {
  const layoutJson = JSON.stringify(layout);
  const [existing] = await db
    .select({ id: userSettings.id })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (existing) {
    await db.update(userSettings)
      .set({ dashboardLayout: layoutJson })
      .where(eq(userSettings.userId, userId));
  } else {
    await db.insert(userSettings)
      .values({ id: uuid(), userId, dashboardLayout: layoutJson });
  }
}

export async function updateAiSettings(
  input: z.infer<typeof updateAiSettingsSchema>,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  const parsed = updateAiSettingsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { aiProvider, aiModel, aiApiKey, aiBaseUrl, aiConfidenceThreshold } = parsed.data;

  await upsertAiSettings(session.user.id, {
    aiProvider,
    aiModel,
    aiApiKey: aiApiKey ? encrypt(aiApiKey) : undefined,
    aiBaseUrl: aiBaseUrl || undefined,
    aiConfidenceThreshold,
  });

  revalidatePath("/settings");
  return { success: true };
}

export async function testAiConnection(
  input: z.infer<typeof testAiConnectionSchema>,
): Promise<{ success: true; response: string; toolCallingSupported: boolean } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  const parsed = testAiConnectionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { aiProvider, aiModel, aiBaseUrl } = parsed.data;

  let apiKey = parsed.data.aiApiKey;
  if (!apiKey) {
    const stored = await getUserAiSettings(session.user.id);
    if (!stored?.rawEncryptedKey) return { error: "No API key configured" };
    apiKey = decrypt(stored.rawEncryptedKey);
  }

  try {
    const model = createUserModel({
      aiProvider: aiProvider as AiProvider,
      aiModel,
      aiApiKey: apiKey,
      aiBaseUrl,
    });

    const { text } = await generateText({
      model,
      prompt: "Say 'connected' in one word.",
      maxOutputTokens: 10,
    });

    let toolCallingSupported = true;
    try {
      await generateText({
        model,
        prompt: "What is 1+1?",
        tools: {
          add: {
            description: "Add two numbers",
            inputSchema: z.object({ a: z.number(), b: z.number() }),
            execute: async ({ a, b }: { a: number; b: number }) => ({ result: a + b }),
          },
        },
        stopWhen: stepCountIs(2),
        maxOutputTokens: 50,
      });
    } catch {
      toolCallingSupported = false;
    }

    await upsertAiSettings(session.user.id, {
      aiProvider,
      aiModel,
      toolCallingSupported,
    });

    return { success: true, response: text, toolCallingSupported };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Connection failed";
    return { error: message };
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
      .set({ demoMode: !existing.demoMode, updatedAt: nowISO() })
      .where(eq(userSettings.id, existing.id));
  } else {
    await db.insert(userSettings)
      .values({ id: uuid(), userId: session.user.id, demoMode: true });
  }

  revalidatePath("/", "layout");
  return { success: true };
}
