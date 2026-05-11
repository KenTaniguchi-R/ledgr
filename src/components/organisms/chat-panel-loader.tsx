"use client";

import dynamic from "next/dynamic";

const ChatPanel = dynamic(
  () => import("@/components/organisms/chat-panel").then((m) => ({ default: m.ChatPanel })),
  { ssr: false },
);

export function ChatPanelLoader({ hasAiConfigured }: { hasAiConfigured: boolean }) {
  return <ChatPanel hasAiConfigured={hasAiConfigured} />;
}
