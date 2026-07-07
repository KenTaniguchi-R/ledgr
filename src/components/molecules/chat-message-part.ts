import { getToolName, isToolUIPart, type UIMessage } from "ai";

type MessagePart = UIMessage["parts"][number];

/**
 * Status label for a tool-invocation message part, or null for non-tool parts.
 *
 * Handles both static (`tool-<name>`) and `dynamic-tool` parts. In AI SDK v7,
 * statically-declared tools stream as `tool-<name>`, so matching only
 * `dynamic-tool` silently dropped every financial tool's activity indicator.
 */
export function toolPartLabel(part: MessagePart): string | null {
  if (!isToolUIPart(part)) return null;
  const name = getToolName(part);
  const isDone =
    part.state === "output-available" ||
    part.state === "output-error" ||
    part.state === "output-denied";
  return isDone ? `Done: ${name}` : `Running: ${name}...`;
}
