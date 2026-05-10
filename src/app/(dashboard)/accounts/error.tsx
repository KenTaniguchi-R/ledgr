"use client";

import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function AccountsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
      <AlertCircle className="size-10 text-muted-foreground mb-4" />
      <h2 className="text-lg font-semibold">
        Something went wrong loading your accounts
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Please try again. If the problem persists, check your database connection.
      </p>
      <Button onClick={reset} className="mt-4" variant="outline">
        Try Again
      </Button>
    </div>
  );
}
