"use client";

import { useTransition, useState, useCallback } from "react";

type ActionResult = { error?: string; success?: boolean } | void;

export function useActionTransition() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    (fn: () => Promise<ActionResult>) => {
      setError(null);
      startTransition(async () => {
        const result = await fn();
        if (result && "error" in result && result.error) {
          setError(result.error);
        }
      });
    },
    [startTransition],
  );

  return { isPending, error, clearError: () => setError(null), execute };
}
