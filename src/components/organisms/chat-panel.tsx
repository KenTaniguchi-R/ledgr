"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useChatPanel } from "@/components/providers/chat-panel-provider";
import { ChatMessage } from "@/components/molecules/chat-message";
import { ChatInput } from "@/components/molecules/chat-input";
import { ChatEmptyState } from "@/components/molecules/chat-empty-state";

interface Props {
  hasAiConfigured: boolean;
}

export function ChatPanel({ hasAiConfigured }: Props) {
  const { isOpen, close } = useChatPanel();
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/ai/chat" }),
  });

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function handleSend(text: string) {
    sendMessage({ text });
  }

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col p-0 sm:w-[400px]"
      >
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="text-base">AI Assistant</SheetTitle>
        </SheetHeader>

        {messages.length === 0 ? (
          <ChatEmptyState onSuggest={handleSend} hasAiConfigured={hasAiConfigured} />
        ) : (
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-3"
            aria-live="polite"
          >
            {messages.map((m) => (
              <ChatMessage key={m.id} message={m} />
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  Thinking...
                </div>
              </div>
            )}
          </div>
        )}

        <ChatInput onSend={handleSend} isLoading={isLoading} />
      </SheetContent>
    </Sheet>
  );
}
