"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { X, ArrowLeftRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription, AlertAction } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "ledgr:transfer-review-nudge-dismissed";
const DISMISS_EVENT = "ledgr:transfer-review-nudge-dismiss";

// Same useSyncExternalStore approach as ReviewNudge, for the same reason:
// sessionStorage doesn't exist during SSR, so the server snapshot is always
// "not dismissed" and React reconciles to the real value on hydration.
function subscribe(onChange: () => void) {
  window.addEventListener(DISMISS_EVENT, onChange);
  return () => window.removeEventListener(DISMISS_EVENT, onChange);
}

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

interface TransferReviewNudgeProps {
  /** Single-leg transfer suggestions awaiting confirmation. Does not render at zero. */
  suggestedCount: number;
}

export function TransferReviewNudge({ suggestedCount }: TransferReviewNudgeProps) {
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

  if (suggestedCount === 0 || dismissed) return null;

  return (
    <Alert variant="warning" className="mb-6 pr-2 sm:pr-44">
      <ArrowLeftRight />
      <AlertTitle>
        {suggestedCount.toLocaleString()}{" "}
        {suggestedCount === 1 ? "transaction looks" : "transactions look"} like a transfer
      </AlertTitle>
      <AlertDescription>
        Payments like Zelle or Venmo can be real spending or just money moving between your own
        accounts — confirm which before they skew your totals.
      </AlertDescription>
      <AlertAction className="flex items-center gap-1">
        <Link href="/transactions?mode=review-transfers" className={cn(buttonVariants({ size: "sm" }))}>
          Review
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
