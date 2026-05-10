"use client";

import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { centsToInputDisplay, parseToCents } from "@/lib/money";
import { cn } from "@/lib/utils";

interface CurrencyInputProps {
  value: number;
  onChange: (cents: number) => void;
  onBlur?: () => void;
  disabled?: boolean;
  className?: string;
}

export function CurrencyInput({
  value,
  onChange,
  onBlur,
  disabled = false,
  className,
}: CurrencyInputProps) {
  const [display, setDisplay] = useState(centsToInputDisplay(value));

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setDisplay(raw);
      const cents = parseToCents(raw);
      if (cents !== null) onChange(cents);
    },
    [onChange],
  );

  const handleBlur = useCallback(() => {
    const cents = parseToCents(display);
    if (cents !== null) {
      setDisplay(centsToInputDisplay(cents));
      onChange(cents);
    } else {
      setDisplay(centsToInputDisplay(value));
    }
    onBlur?.();
  }, [display, value, onChange, onBlur]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      disabled={disabled}
      className={cn("text-right tabular-nums", className)}
    />
  );
}
