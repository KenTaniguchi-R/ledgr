"use client";

import { Button } from "@/components/ui/button";

interface Props {
  onSuggest: (prompt: string) => void;
  hasAiConfigured: boolean;
}

const SUGGESTIONS = [
  "How much did I spend on food this month?",
  "What are my upcoming bills?",
  "Show my spending trends for the last 3 months",
  "What's my biggest expense category?",
];

export function ChatEmptyState({ onSuggest, hasAiConfigured }: Props) {
  if (!hasAiConfigured) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="text-center text-sm text-muted-foreground">
          <p className="font-medium">AI not configured</p>
          <p className="mt-1">
            <a href="/settings" className="text-primary underline">
              Go to Settings
            </a>{" "}
            to add your API key.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
      <p className="text-sm font-medium text-muted-foreground">
        Ask me anything about your finances
      </p>
      <div className="flex flex-col gap-2">
        {SUGGESTIONS.map((s) => (
          <Button
            key={s}
            variant="outline"
            size="sm"
            className="h-auto whitespace-normal text-left text-xs"
            onClick={() => onSuggest(s)}
          >
            {s}
          </Button>
        ))}
      </div>
    </div>
  );
}
