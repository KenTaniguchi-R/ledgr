import { streamText, convertToModelMessages, UIMessage, stepCountIs } from "ai";
import { getSession, getHouseholdId } from "@/lib/auth/session";
import { guardDemoMode } from "@/lib/demo-mode";
import { getAiConfig, createAiModel } from "@/lib/ai/config";
import { financialTools } from "@/lib/ai/chat/tools";
import { buildSystemPrompt } from "@/lib/ai/chat/system-prompt";

export const maxDuration = 30;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const config = getAiConfig();
  const model = createAiModel();

  if (!config || !model) {
    return Response.json(
      { error: "AI not configured. Set AI_PROVIDER and AI_MODEL in your .env file." },
      { status: 400 },
    );
  }

  const blocked = await guardDemoMode(session.user.id);
  if (blocked) {
    return Response.json(blocked, { status: 403 });
  }

  const { messages }: { messages: UIMessage[] } = await request.json();
  const householdId = await getHouseholdId();
  const tools = config.toolCalling ? financialTools(householdId) : undefined;

  const result = streamText({
    model,
    system: await buildSystemPrompt(householdId),
    messages: await convertToModelMessages(messages),
    ...(tools ? { tools, stopWhen: stepCountIs(5) } : {}),
    abortSignal: request.signal,
  });

  return result.toUIMessageStreamResponse();
}
