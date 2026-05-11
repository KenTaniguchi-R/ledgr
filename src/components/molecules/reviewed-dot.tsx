"use client";

import { useState, useTransition } from "react";
import { toggleReviewed } from "@/actions/transactions";
import { cn } from "@/lib/utils";

interface ReviewedDotProps {
  transactionId: string;
  reviewed: boolean;
}

export function ReviewedDot({ transactionId, reviewed }: ReviewedDotProps) {
  const [isReviewed, setIsReviewed] = useState(reviewed);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const prev = isReviewed;
    setIsReviewed(!prev);

    startTransition(async () => {
      const result = await toggleReviewed(transactionId);
      if ("error" in result) {
        setIsReviewed(prev);
      } else {
        setIsReviewed(result.reviewed);
      }
    });
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={cn(
        "flex items-center justify-center size-6 rounded-full transition-opacity",
        isPending && "opacity-50",
      )}
      aria-label={isReviewed ? "Mark as unreviewed" : "Mark as reviewed"}
    >
      <span
        className={cn(
          "size-1.5 rounded-full transition-colors",
          isReviewed ? "bg-transparent" : "bg-primary",
        )}
      />
    </button>
  );
}
