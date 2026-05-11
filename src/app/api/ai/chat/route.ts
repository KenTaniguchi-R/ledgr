import { streamText, convertToModelMessages, UIMessage, stepCountIs } from "ai";
import { getSession, getHouseholdId } from "@/lib/auth/session";
import { guardDemoMode } from "@/lib/demo-mode";
import { getUserAiSettings } from "@/queries/settings";
import { createUserModel, type AiProvider } from "@/lib/ai/provider";
import { decrypt } from "@/lib/encryption";
import { financialTools } from "@/lib/ai/chat/tools";
import { buildSystemPrompt } from "@/lib/ai/chat/system-prompt";

export const maxDuration = 30;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const settings = await getUserAiSettings(session.user.id);

  if (!settings?.aiProvider || !settings?.aiModel || !settings.hasKey) {
    return Response.json(
      { error: "AI not configured. Go to Settings to add your API key." },
      { status: 400 },
    );
  }

  const blocked = await guardDemoMode(session.user.id);
  if (blocked) {
    return Response.json(blocked, { status: 403 });
  }

  const model = createUserModel({
    aiProvider: settings.aiProvider as AiProvider,
    aiModel: settings.aiModel,
    aiApiKey: decrypt(settings.rawEncryptedKey!),
    aiBaseUrl: settings.aiBaseUrl ?? undefined,
    confidenceThreshold: 0.7,
    toolCalling: settings.toolCallingSupported !== false,
  });

  const { messages }: { messages: UIMessage[] } = await request.json();
  const householdId = await getHouseholdId();

  const useTools = settings.toolCallingSupported !== false;
  const tools = useTools ? financialTools(householdId) : undefined;

  const result = streamText({
    model,
    system: await buildSystemPrompt(householdId),
    messages: await convertToModelMessages(messages),
    ...(tools ? { tools, stopWhen: stepCountIs(5) } : {}),
    abortSignal: request.signal,
  });

  return result.toUIMessageStreamResponse();
}
