import { streamText, convertToModelMessages, UIMessage, stepCountIs } from "ai";
import { getSession, resolveHouseholdId } from "@/lib/auth/session";
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

  const settings = getUserAiSettings(session.user.id);

  if (!settings?.aiProvider || !settings?.aiModel || !settings.hasKey) {
    return Response.json(
      { error: "AI not configured. Go to Settings to add your API key." },
      { status: 400 },
    );
  }

  const model = createUserModel({
    aiProvider: settings.aiProvider as AiProvider,
    aiModel: settings.aiModel,
    aiApiKey: decrypt(settings.rawEncryptedKey!),
    aiBaseUrl: settings.aiBaseUrl ?? undefined,
  });

  const { messages }: { messages: UIMessage[] } = await request.json();
  const householdId = resolveHouseholdId(session.user.id);

  const useTools = settings.toolCallingSupported !== false;
  const tools = useTools ? financialTools(householdId) : undefined;

  const result = streamText({
    model,
    system: buildSystemPrompt(householdId),
    messages: await convertToModelMessages(messages),
    ...(tools ? { tools, stopWhen: stepCountIs(5) } : {}),
    abortSignal: request.signal,
  });

  return result.toUIMessageStreamResponse();
}
