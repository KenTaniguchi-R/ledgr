"use client";

import type { UIMessage } from "ai";
import { cn } from "@/lib/utils";
import { toolPartLabel } from "./chat-message-part";

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
          const toolLabel = toolPartLabel(part);
          if (toolLabel) {
            return (
              <p key={i} className="text-xs text-muted-foreground italic">
                {toolLabel}
              </p>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
