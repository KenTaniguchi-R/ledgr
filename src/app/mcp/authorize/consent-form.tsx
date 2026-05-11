"use client";

import { useTransition } from "react";
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
      <button
        className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
        disabled={isPending}
        onClick={() => { startTransition(() => denyConsent({ redirectUri, state })); }}
      >
        Deny
      </button>
      <button
        className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        disabled={isPending}
        onClick={() => { startTransition(() => approveConsent({ clientId, redirectUri, codeChallenge, scope, state })); }}
      >
        {isPending ? "..." : "Allow"}
      </button>
    </div>
  );
}
