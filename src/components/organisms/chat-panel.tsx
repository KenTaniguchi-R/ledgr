"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import { X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatMessage } from "@/components/molecules/chat-message";
import { ChatInput } from "@/components/molecules/chat-input";
import { ChatEmptyState } from "@/components/molecules/chat-empty-state";

interface Props {
  hasAiConfigured: boolean;
}

export function ChatPanel({ hasAiConfigured }: Props) {
  const [isOpen, setIsOpen] = useState(false);
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
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-label={isOpen ? "Close AI assistant" : "Open AI assistant"}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex size-14 items-center justify-center rounded-full shadow-lg transition-all duration-300 ease-out",
          "bg-primary text-primary-foreground hover:scale-105 hover:shadow-xl active:scale-95",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          !isOpen && "animate-[pulse-subtle_3s_ease-in-out_infinite]",
        )}
      >
        {isOpen ? (
          <X className="size-5" />
        ) : (
          <Sparkles className="size-5" />
        )}
      </button>

      {/* Floating Chat Dialog */}
      <div
        role="dialog"
        aria-label="AI Assistant"
        aria-hidden={!isOpen}
        className={cn(
          "fixed bottom-24 right-6 z-50 flex w-[400px] flex-col overflow-hidden rounded-2xl border bg-background/95 shadow-2xl backdrop-blur-sm transition-all duration-300 ease-out",
          "max-h-[min(560px,calc(100vh-120px))]",
          isOpen
            ? "translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-4 scale-95 opacity-0",
          "max-sm:inset-x-4 max-sm:bottom-24 max-sm:w-auto",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="size-3.5 text-primary" />
            </div>
            <h2 className="text-sm font-semibold">Ledgr AI</h2>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Messages */}
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
                <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  <span className="inline-flex gap-0.5">
                    <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Input */}
        <ChatInput onSend={handleSend} isLoading={isLoading} />
      </div>
    </>
  );
}
