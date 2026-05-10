"use client";

import type { UIMessage } from "ai";
import { cn } from "@/lib/utils";

interface Props {
  message: UIMessage;
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return (
              <p key={i} className="whitespace-pre-wrap">
                {part.text}
              </p>
            );
          }
          if (part.type === "dynamic-tool") {
            const isDone =
              part.state === "output-available" ||
              part.state === "output-error" ||
              part.state === "output-denied";
            return (
              <p key={i} className="text-xs text-muted-foreground italic">
                {isDone
                  ? `Done: ${part.toolName}`
                  : `Running: ${part.toolName}...`}
              </p>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
