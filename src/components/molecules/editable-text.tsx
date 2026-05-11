"use client";

import { useState, useCallback, useTransition } from "react";
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
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();

  const displayValue = isEditing ? draft : value;

  const handleClick = useCallback(() => {
    if (!disabled) {
      setDraft(value);
      setIsEditing(true);
    }
  }, [disabled, value]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (draft === value) return;

    startTransition(async () => {
      const result = await onSave(draft);
      if ("error" in result) {
        setDraft(value);
      }
    });
  }, [draft, value, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        (e.target as HTMLInputElement).blur();
      }
      if (e.key === "Escape") {
        setDraft(value);
        setIsEditing(false);
      }
    },
    [value],
  );

  if (isEditing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
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
        !displayValue && "text-muted-foreground italic",
        isPending && "opacity-50",
        className,
      )}
    >
      {displayValue || placeholder}
    </button>
  );
}
