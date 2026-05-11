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
