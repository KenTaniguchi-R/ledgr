"use client";

import { useEffect } from "react";
import type { ReviewPhase } from "@/hooks/use-review-queue";

interface ReviewKeyboardHandlers {
  onConfirm: () => void;
  onSkip: () => void;
  onRetreat: () => void;
  onEditCategory: () => void;
  onEditNotes: () => void;
  onExit: () => void;
}

export function useReviewKeyboard(
  phase: ReviewPhase,
  handlers: ReviewKeyboardHandlers,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled || phase !== "VIEWING") return;

    function handleKeyDown(e: KeyboardEvent) {
      // These shortcuts belong to whatever the user is actually typing in or
      // choosing from — the category popover's own list, the notes field,
      // above all. Without this, Enter both picks the highlighted category
      // *and* confirms/advances the queue, since this listener is capture-
      // phase on `document` and fires ahead of the popover's own handling.
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable], [role="listbox"], [role="menu"]')) {
        return;
      }

      switch (e.key) {
        case "Enter":
          e.preventDefault();
          handlers.onConfirm();
          break;
        case "ArrowRight":
        case "ArrowDown":
          e.preventDefault();
          handlers.onSkip();
          break;
        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault();
          handlers.onRetreat();
          break;
        case "e":
        case "E":
          e.preventDefault();
          handlers.onEditCategory();
          break;
        case "n":
        case "N":
          e.preventDefault();
          handlers.onEditNotes();
          break;
        case "Escape":
          e.preventDefault();
          handlers.onExit();
          break;
      }
    }

    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [phase, handlers, enabled]);
}
