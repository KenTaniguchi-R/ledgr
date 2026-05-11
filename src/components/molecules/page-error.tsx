"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <AlertCircle className="h-10 w-10 text-destructive mb-3" />
      <h2 className="text-lg font-medium">Something went wrong</h2>
      <p className="text-sm text-muted-foreground mt-1">
        {error.message || "An unexpected error occurred."}
      </p>
      <Button variant="outline" size="sm" onClick={reset} className="mt-4">
        Try Again
      </Button>
    </div>
  );
}
