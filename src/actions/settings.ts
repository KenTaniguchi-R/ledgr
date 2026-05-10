"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { encrypt } from "@/lib/encryption";
import { getUserAiSettings, upsertAiSettings } from "@/queries/settings";
import { createUserModel, type AiProvider } from "@/lib/ai/provider";
import { generateText, stepCountIs } from "ai";

const aiSettingsSchema = z.object({
  aiProvider: z.enum(["openai", "anthropic", "google", "custom"]),
  aiModel: z.string().min(1, "Model is required"),
  aiApiKey: z.string().optional(),
  aiBaseUrl: z.string().url().optional().or(z.literal("")),
  aiConfidenceThreshold: z.number().min(0.5).max(0.9).optional(),
});

export async function updateAiSettings(
  input: z.infer<typeof aiSettingsSchema>,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  const parsed = aiSettingsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { aiProvider, aiModel, aiApiKey, aiBaseUrl, aiConfidenceThreshold } = parsed.data;

  const encryptedKey = aiApiKey ? encrypt(aiApiKey) : undefined;

  upsertAiSettings(session.user.id, {
    aiProvider,
    aiModel,
    aiApiKey: encryptedKey,
    aiBaseUrl: aiBaseUrl || undefined,
    aiConfidenceThreshold,
  });

  revalidatePath("/settings");
  return { success: true };
}

export async function testAiConnection(input: {
  aiProvider: AiProvider;
  aiModel: string;
  aiApiKey: string;
  aiBaseUrl?: string;
}): Promise<{ success: true; response: string; toolCallingSupported: boolean } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  try {
    const model = createUserModel({
      aiProvider: input.aiProvider,
      aiModel: input.aiModel,
      aiApiKey: input.aiApiKey,
      aiBaseUrl: input.aiBaseUrl,
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
      aiProvider: input.aiProvider,
      aiModel: input.aiModel,
      toolCallingSupported,
    });

    return { success: true, response: text, toolCallingSupported };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Connection failed";
    return { error: message };
  }
}
