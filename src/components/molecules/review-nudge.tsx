"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { X, CircleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription, AlertAction } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { centsToDisplay } from "@/lib/money";
import type { UncategorizedShare } from "@/lib/uncategorized-share";

const DISMISS_KEY = "ledgr:review-nudge-dismissed";
const DISMISS_EVENT = "ledgr:review-nudge-dismiss";

// Read through useSyncExternalStore rather than an effect: sessionStorage does
// not exist during SSR, so the server snapshot is always "not dismissed" and
// React reconciles to the real value on hydration without a mismatch.
function subscribe(onChange: () => void) {
  window.addEventListener(DISMISS_EVENT, onChange);
  return () => window.removeEventListener(DISMISS_EVENT, onChange);
}

// Fallback for when sessionStorage throws (private browsing, blocked site
// data). Without it the dismiss button would be a no-op for those users,
// which is the one thing this control must never be.
let dismissedInMemory = false;

function isDismissed() {
  if (dismissedInMemory) return true;
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function notDismissedOnServer() {
  return false;
}

interface ReviewNudgeProps {
  /** Transactions awaiting review. The nudge does not render at zero. */
  unreviewedCount: number;
  /** Uncategorized spend for the displayed month, or null if there is none. */
  share: UncategorizedShare | null;
  /** Month label for the share, e.g. "August". */
  monthLabel: string;
}

export function ReviewNudge({ unreviewedCount, share, monthLabel }: ReviewNudgeProps) {
  const dismissed = useSyncExternalStore(subscribe, isDismissed, notDismissedOnServer);

  function dismiss() {
    dismissedInMemory = true;
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Storage unavailable. The event below still hides it for this view.
    }
    window.dispatchEvent(new Event(DISMISS_EVENT));
  }

  // A tidy household never sees this — no congratulatory empty state.
  if (unreviewedCount === 0 || dismissed) return null;

  return (
    // Caution, not alarm: an untidy ledger is not an emergency, so this is the
    // warning variant rather than destructive.
    <Alert variant="warning" className="mb-6 pr-2 sm:pr-44">
      <CircleAlert />
      <AlertTitle>
        {unreviewedCount.toLocaleString()}{" "}
        {unreviewedCount === 1 ? "transaction needs" : "transactions need"} a category
      </AlertTitle>
      {share && (
        <AlertDescription>
          {centsToDisplay(share.amount)} of {monthLabel} spending — {share.pct}% — is still
          uncategorized, so budgets and reports are under-counting.
        </AlertDescription>
      )}
      <AlertAction className="flex items-center gap-1">
        <Link href="/transactions?mode=review" className={cn(buttonVariants({ size: "sm" }))}>
          Start reviewing
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={dismiss}
          aria-label="Dismiss until next visit"
        >
          <X />
        </Button>
      </AlertAction>
    </Alert>
  );
}
