"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, AlertCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type SyncStatus = "idle" | "syncing" | "success" | "error";

interface SyncStatusBadgeProps {
  status: SyncStatus;
  errorMessage?: string;
  onClearSuccess?: () => void;
}

export function SyncStatusBadge({
  status,
  errorMessage,
  onClearSuccess,
}: SyncStatusBadgeProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (status !== "success") {
      setVisible(true);
      return;
    }

    const timer = setTimeout(() => {
      setVisible(false);
      onClearSuccess?.();
    }, 3000);

    return () => clearTimeout(timer);
  }, [status, onClearSuccess]);

  if (status === "idle") return null;

  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1 text-xs transition-opacity duration-300 ${
        !visible ? "opacity-0" : "opacity-100"
      }`}
    >
      {status === "syncing" && (
        <>
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">Syncing...</span>
        </>
      )}
      {status === "success" && (
        <>
          <Check className="size-3.5 text-emerald-500" />
          <span className="text-emerald-500">Synced</span>
        </>
      )}
      {status === "error" && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className="inline-flex items-center gap-1 cursor-help bg-transparent border-0 p-0">
              <AlertCircle className="size-3.5 text-destructive" />
              <span className="text-destructive">Sync failed</span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{errorMessage ?? "An error occurred during sync"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </span>
  );
}
