"use client";

import { useState, useRef, useCallback } from "react";
import { parseToCents, centsToInputDisplay } from "@/lib/money";

interface UseAmountFilterOptions {
  initialMin: string | null;
  initialMax: string | null;
  onUpdate: (key: "amountMin" | "amountMax", value: string | null) => void;
}

export function useAmountFilter({ initialMin, initialMax, onUpdate }: UseAmountFilterOptions) {
  const [minDisplay, setMinDisplay] = useState(
    initialMin ? centsToInputDisplay(parseInt(initialMin, 10)) : "",
  );
  const [maxDisplay, setMaxDisplay] = useState(
    initialMax ? centsToInputDisplay(parseInt(initialMax, 10)) : "",
  );
  const minDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const maxDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(
    (key: "amountMin" | "amountMax", displayValue: string) => {
      if (displayValue === "") {
        onUpdate(key, null);
        return;
      }
      const cents = parseToCents(displayValue);
      if (cents !== null && cents >= 0) {
        onUpdate(key, String(cents));
      }
    },
    [onUpdate],
  );

  function handleMinChange(value: string) {
    setMinDisplay(value);
    if (minDebounceRef.current) clearTimeout(minDebounceRef.current);
    minDebounceRef.current = setTimeout(() => flush("amountMin", value), 500);
  }

  function handleMaxChange(value: string) {
    setMaxDisplay(value);
    if (maxDebounceRef.current) clearTimeout(maxDebounceRef.current);
    maxDebounceRef.current = setTimeout(() => flush("amountMax", value), 500);
  }

  function handleBlur(key: "amountMin" | "amountMax") {
    const ref = key === "amountMin" ? minDebounceRef : maxDebounceRef;
    const display = key === "amountMin" ? minDisplay : maxDisplay;
    if (ref.current) clearTimeout(ref.current);
    flush(key, display);
  }

  function reset() {
    setMinDisplay("");
    setMaxDisplay("");
  }

  return { minDisplay, maxDisplay, handleMinChange, handleMaxChange, handleBlur, reset };
}
