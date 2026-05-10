"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { usePlaidLink } from "react-plaid-link";
import type { PlaidLinkError } from "react-plaid-link";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Building2 } from "lucide-react";
import { createLinkToken, exchangePublicToken } from "@/actions/plaid";

interface PlaidLinkFlowProps {
  variant?: "primary" | "dropdown-item";
  label?: string;
}

export function PlaidLinkFlow({
  variant = "primary",
  label = "Connect Bank",
}: PlaidLinkFlowProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exchanging, setExchanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const onSuccess = useCallback(async (publicToken: string) => {
    setExchanging(true);
    setError(null);
    try {
      const result = await exchangePublicToken(publicToken);
      if ("error" in result && result.error) {
        setError(result.error);
      }
    } catch {
      setError("Failed to connect account");
    } finally {
      setExchanging(false);
      setLinkToken(null);
      triggerRef.current?.focus();
    }
  }, []);

  const onExit = useCallback(
    (err: PlaidLinkError | null) => {
      setLinkToken(null);
      if (err) {
        setError(err.display_message || err.error_message || "Connection was interrupted");
      }
      triggerRef.current?.focus();
    },
    []
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
  });

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await createLinkToken();
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      if ("linkToken" in result && result.linkToken) {
        setLinkToken(result.linkToken);
      }
    } catch {
      setError("Failed to initialize bank connection");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (linkToken && ready && !exchanging) {
      open();
    }
  }, [linkToken, ready, exchanging, open]);

  const isLoading = loading || exchanging;

  if (variant === "dropdown-item") {
    return (
      <button
        ref={triggerRef}
        onClick={handleClick}
        disabled={isLoading}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted rounded-sm disabled:opacity-50"
      >
        {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Building2 className="size-4" />}
        {label}
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
        {exchanging ? "Connecting..." : label}
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
