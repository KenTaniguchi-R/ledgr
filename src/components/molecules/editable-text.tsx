"use client";

import { useState, useRef, useCallback, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface EditableTextProps {
  value: string;
  onSave: (value: string) => Promise<{ success: true } | { error: string }>;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
}

export function EditableText({
  value,
  onSave,
  placeholder = "Click to edit",
  className,
  inputClassName,
  disabled = false,
}: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const savedRef = useRef(value);
  const [isPending, startTransition] = useTransition();

  const handleClick = useCallback(() => {
    if (!disabled) setIsEditing(true);
  }, [disabled]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (localValue === savedRef.current) return;

    startTransition(async () => {
      const result = await onSave(localValue);
      if ("error" in result) {
        setLocalValue(savedRef.current);
      } else {
        savedRef.current = localValue;
      }
    });
  }, [localValue, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        (e.target as HTMLInputElement).blur();
      }
      if (e.key === "Escape") {
        setLocalValue(savedRef.current);
        setIsEditing(false);
      }
    },
    [],
  );

  if (isEditing) {
    return (
      <Input
        autoFocus
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={isPending}
        className={cn("h-auto py-0.5 px-1 text-sm", inputClassName)}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        "text-left text-sm cursor-pointer rounded px-1 py-0.5 -mx-1",
        "hover:bg-muted/50 hover:underline decoration-muted-foreground/40 underline-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        !localValue && "text-muted-foreground italic",
        isPending && "opacity-50",
        className,
      )}
    >
      {localValue || placeholder}
    </button>
  );
}
