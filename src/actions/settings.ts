"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { decrypt, encrypt } from "@/lib/encryption";
import { getUserAiSettings, upsertAiSettings } from "@/queries/settings";
import { createUserModel, type AiProvider } from "@/lib/ai/provider";
import { generateText, stepCountIs } from "ai";

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

export async function updateAiSettings(
  input: z.infer<typeof updateAiSettingsSchema>,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  const parsed = updateAiSettingsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { aiProvider, aiModel, aiApiKey, aiBaseUrl, aiConfidenceThreshold } = parsed.data;

  upsertAiSettings(session.user.id, {
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
    const stored = getUserAiSettings(session.user.id);
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

    upsertAiSettings(session.user.id, {
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
