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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const handleFocus = useCallback(() => {
    setDraft(centsToInputDisplay(value));
    setEditing(true);
  }, [value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setDraft(raw);
      const cents = parseToCents(raw);
      if (cents !== null) onChange(cents);
    },
    [onChange],
  );

  const handleBlur = useCallback(() => {
    setEditing(false);
    const cents = parseToCents(draft);
    if (cents !== null) onChange(cents);
    onBlur?.();
  }, [draft, onChange, onBlur]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={editing ? draft : centsToInputDisplay(value)}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
      disabled={disabled}
      className={cn("text-right tabular-nums", className)}
    />
  );
}
