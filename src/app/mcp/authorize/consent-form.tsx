"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { approveConsent, denyConsent } from "./actions";

interface Props {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  state: string | null;
}

export function ConsentForm({ clientId, redirectUri, codeChallenge, scope, state }: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex gap-3">
      <Button
        variant="outline"
        className="flex-1"
        disabled={isPending}
        onClick={() => { startTransition(() => denyConsent({ redirectUri, state })); }}
      >
        Deny
      </Button>
      <Button
        className="flex-1"
        disabled={isPending}
        onClick={() => { startTransition(() => approveConsent({ clientId, redirectUri, codeChallenge, scope, state })); }}
      >
        {isPending ? "..." : "Allow"}
      </Button>
    </div>
  );
}
