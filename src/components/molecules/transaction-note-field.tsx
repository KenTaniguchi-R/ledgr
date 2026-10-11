"use client";

import { useState, useTransition } from "react";
import { StickyNote } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface TransactionNoteFieldProps {
  /** Read once on mount — the panel keys itself by transaction, so a new
   * transaction is a new field rather than a reset of this one. */
  initialValue: string | null;
  onSave: (value: string) => Promise<{ success: true } | { error: string }>;
}

/**
 * Its own card, always open — a note is the one field in the detail panel
 * someone might actually write a sentence into, not a settings toggle. Saves
 * on blur, and only when the text changed.
 */
export function TransactionNoteField({ initialValue, onSave }: TransactionNoteFieldProps) {
  const [saved, setSaved] = useState(initialValue ?? "");
  const [draft, setDraft] = useState(saved);
  const [isPending, startTransition] = useTransition();

  const handleBlur = () => {
    if (draft === saved) return;
    startTransition(async () => {
      const result = await onSave(draft);
      if ("error" in result) setDraft(saved);
      else setSaved(draft);
    });
  };

  return (
    <div className="rounded-xl bg-card px-3.5 py-3 ring-1 ring-foreground/10">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
        <StickyNote className="size-3" aria-hidden />
        Note
      </div>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlur}
        disabled={isPending}
        placeholder="Add a note…"
        rows={2}
        aria-label="Note"
        className="min-h-12 resize-none border-none bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 md:text-sm"
      />
    </div>
  );
}
