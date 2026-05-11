"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { usePlaidLink } from "react-plaid-link";
import type { PlaidLinkError } from "react-plaid-link";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Building2, Link as LinkIcon } from "lucide-react";
import { createLinkToken, exchangePublicToken } from "@/actions/plaid";
import { createUpdateLinkToken, completeReAuth } from "@/actions/reauth";

interface PlaidLinkFlowProps {
  variant?: "primary" | "dropdown-item" | "reconnect-inline";
  label?: string;
  mode?: "connect" | "update";
  plaidItemId?: string;
  onReAuthSuccess?: () => void;
  onError?: (error: string) => void;
}

export function PlaidLinkFlow({
  variant = "primary",
  label,
  mode = "connect",
  plaidItemId,
  onReAuthSuccess,
  onError,
}: PlaidLinkFlowProps) {
  const defaultLabel = mode === "update" ? "Reconnect" : "Connect Bank";
  const displayLabel = label ?? defaultLabel;

  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exchanging, setExchanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const onSuccess = useCallback(async (publicToken: string) => {
    setExchanging(true);
    setError(null);
    try {
      if (mode === "update" && plaidItemId) {
        const result = await completeReAuth(plaidItemId);
        if ("error" in result && result.error) {
          setError(result.error);
          onError?.(result.error);
        } else {
          onReAuthSuccess?.();
        }
      } else {
        const result = await exchangePublicToken(publicToken);
        if ("error" in result && result.error) {
          setError(result.error);
        }
      }
    } catch {
      const msg = mode === "update" ? "Re-authentication failed" : "Failed to connect account";
      setError(msg);
      onError?.(msg);
    } finally {
      setExchanging(false);
      setLinkToken(null);
      triggerRef.current?.focus();
    }
  }, [mode, plaidItemId, onReAuthSuccess, onError]);

  const onExit = useCallback(
    (err: PlaidLinkError | null) => {
      setLinkToken(null);
      if (err) {
        const msg = err.display_message || err.error_message || "Connection was interrupted";
        setError(msg);
        onError?.(msg);
      }
      triggerRef.current?.focus();
    },
    [onError]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
  });

  useEffect(() => {
    if (linkToken && ready && !exchanging) {
      open();
    }
  }, [linkToken, ready, exchanging, open]);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      if (mode === "update" && plaidItemId) {
        const result = await createUpdateLinkToken(plaidItemId);
        if ("error" in result && result.error) {
          setError(result.error);
          onError?.(result.error);
          return;
        }
        if ("linkToken" in result && result.linkToken) {
          setLinkToken(result.linkToken);
        }
      } else {
        const result = await createLinkToken();
        if ("error" in result && result.error) {
          setError(result.error);
          return;
        }
        if ("linkToken" in result && result.linkToken) {
          setLinkToken(result.linkToken);
        }
      }
    } catch {
      const msg = mode === "update" ? "Failed to initialize re-authentication" : "Failed to initialize bank connection";
      setError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  };

  const isLoading = loading || exchanging;
  const loadingText = mode === "update" ? "Reconnecting..." : "Connecting...";

  if (variant === "reconnect-inline") {
    return (
      <Button
        ref={triggerRef}
        variant="destructive"
        size="sm"
        onClick={handleClick}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <LinkIcon className="size-3.5" />
        )}
        {isLoading ? loadingText : displayLabel}
      </Button>
    );
  }

  if (variant === "dropdown-item") {
    return (
      <button
        ref={triggerRef}
        onClick={handleClick}
        disabled={isLoading}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted rounded-sm disabled:opacity-50"
      >
        {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Building2 className="size-4" />}
        {displayLabel}
      </button>
    );
  }

  return (
    <div>
      <Button
        ref={triggerRef}
        onClick={handleClick}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Plus className="size-4" />
        )}
        {exchanging ? loadingText : displayLabel}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
          <button
            onClick={handleClick}
            className="ml-2 underline hover:no-underline"
          >
            Retry
          </button>
        </p>
      )}
    </div>
  );
}
