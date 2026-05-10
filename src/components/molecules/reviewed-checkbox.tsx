"use client";

import { useState, useTransition } from "react";
import { toggleReviewed } from "@/actions/transactions";
import { cn } from "@/lib/utils";

interface ReviewedCheckboxProps {
  transactionId: string;
  reviewed: boolean;
}

export function ReviewedCheckbox({ transactionId, reviewed }: ReviewedCheckboxProps) {
  const [isReviewed, setIsReviewed] = useState(reviewed);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const prev = isReviewed;
    setIsReviewed(!prev);

    startTransition(async () => {
      const result = await toggleReviewed(transactionId);
      if ("error" in result) {
        setIsReviewed(prev);
      }
    });
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={cn(
        "text-sm transition-colors",
        isReviewed ? "text-primary" : "text-muted-foreground/40",
        isPending && "opacity-50",
      )}
      title={isReviewed ? "Reviewed" : "Not reviewed"}
    >
      {isReviewed ? "●" : "○"}
    </button>
  );
}
