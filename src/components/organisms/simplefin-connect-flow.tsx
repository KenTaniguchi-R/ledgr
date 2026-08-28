"use client";

import { useState } from "react";
import { Loader2, Building2, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { centsToDisplay } from "@/lib/money";
import {
  claimAndDiscoverAccounts,
  confirmSimplefinAccounts,
  type DiscoveredConnection,
  type ConnectionClassification,
} from "@/actions/simplefin";
import { ACCOUNT_TYPES, type AccountType } from "@/db/schema/accounts";

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: "Checking",
  savings: "Savings",
  credit: "Credit Card",
  loan: "Loan",
  investment: "Investment",
  other: "Other",
};

type Step = "token" | "classify" | "success";

interface ClassifiableAccount {
  connectionId: string;
  externalAccountId: string;
  name: string;
  currency: string;
  currentBalanceCents: number | null;
  availableBalanceCents: number | null;
  type: AccountType;
}

export function SimplefinConnectFlow() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("token");
  const [setupToken, setSetupToken] = useState("");
  const [discoveredAccounts, setDiscoveredAccounts] = useState<ClassifiableAccount[]>([]);
  const [connectionNames, setConnectionNames] = useState<Map<string, string | null>>(new Map());
  const [claiming, setClaiming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep("token");
    setSetupToken("");
    setDiscoveredAccounts([]);
    setConnectionNames(new Map());
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function handleClaim() {
    setClaiming(true);
    setError(null);
    try {
      const result = await claimAndDiscoverAccounts(setupToken);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      if ("connections" in result && result.connections) {
        const names = new Map<string, string | null>();
        const accounts: ClassifiableAccount[] = [];
        for (const connection of result.connections as DiscoveredConnection[]) {
          names.set(connection.connectionId, connection.institutionName);
          for (const account of connection.accounts) {
            accounts.push({
              connectionId: connection.connectionId,
              ...account,
              type: "checking",
            });
          }
        }
        setConnectionNames(names);
        setDiscoveredAccounts(accounts);
        setStep("classify");
      }
    } catch {
      setError("Failed to connect to SimpleFIN");
    } finally {
      setClaiming(false);
    }
  }

  function setAccountType(externalAccountId: string, type: AccountType) {
    setDiscoveredAccounts((prev) =>
      prev.map((a) => (a.externalAccountId === externalAccountId ? { ...a, type } : a)),
    );
  }

  async function handleConfirm() {
    setConfirming(true);
    setError(null);
    try {
      const byConnection = new Map<string, ConnectionClassification["accounts"]>();
      for (const account of discoveredAccounts) {
        const list = byConnection.get(account.connectionId) ?? [];
        list.push({
          externalAccountId: account.externalAccountId,
          name: account.name,
          currency: account.currency,
          currentBalanceCents: account.currentBalanceCents,
          availableBalanceCents: account.availableBalanceCents,
          type: account.type,
        });
        byConnection.set(account.connectionId, list);
      }
      const connectionGroups: ConnectionClassification[] = [...byConnection.entries()].map(
        ([connectionId, accounts]) => ({ connectionId, accounts }),
      );

      const result = await confirmSimplefinAccounts(connectionGroups);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setStep("success");
    } catch {
      setError("Failed to finish connecting your SimpleFIN accounts");
    } finally {
      setConfirming(false);
    }
  }

  const institutionLabel = [...new Set(connectionNames.values())]
    .filter((name): name is string => !!name)
    .join(", ");

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted rounded-sm"
      >
        <Building2 className="size-4" />
        Connect via SimpleFIN
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          {step === "token" && (
            <>
              <DialogHeader>
                <DialogTitle>Connect via SimpleFIN</DialogTitle>
                <DialogDescription>
                  Get a Setup Token from your SimpleFIN Bridge, then paste it below. Ledgr
                  never sees your bank credentials — only a read-only token you control.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor="simplefin-token">Setup Token</Label>
                <Textarea
                  id="simplefin-token"
                  value={setupToken}
                  onChange={(e) => setSetupToken(e.target.value)}
                  placeholder="Paste your Setup Token"
                  className="font-mono text-xs min-h-24"
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground">
                  This token can only be used once — if it&apos;s already been claimed,
                  generate a new one from your Bridge.
                </p>
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">{error}</p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleClaim}
                  disabled={claiming || setupToken.trim().length === 0}
                >
                  {claiming && <Loader2 className="size-4 animate-spin" />}
                  {claiming ? "Connecting..." : "Continue"}
                </Button>
              </DialogFooter>
            </>
          )}

          {step === "classify" && (
            <>
              <DialogHeader>
                <DialogTitle>Choose account types</DialogTitle>
                <DialogDescription>
                  Found {discoveredAccounts.length}{" "}
                  {discoveredAccounts.length === 1 ? "account" : "accounts"}
                  {institutionLabel ? ` at ${institutionLabel}` : ""}. Confirm how each one
                  should show up in Ledgr.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2 max-h-80 overflow-y-auto">
                {discoveredAccounts.map((account) => (
                  <div
                    key={account.externalAccountId}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{account.name}</p>
                      {account.currentBalanceCents !== null && (
                        <p className="text-xs text-muted-foreground font-mono">
                          {centsToDisplay(account.currentBalanceCents, account.currency)} available
                        </p>
                      )}
                    </div>
                    <Select
                      value={account.type}
                      onValueChange={(v) => {
                        if (v !== null) setAccountType(account.externalAccountId, v as AccountType);
                      }}
                    >
                      <SelectTrigger className="w-36 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCOUNT_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {ACCOUNT_TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">{error}</p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setStep("token")}>
                  Back
                </Button>
                <Button onClick={handleConfirm} disabled={confirming}>
                  {confirming && <Loader2 className="size-4 animate-spin" />}
                  {confirming
                    ? "Connecting..."
                    : `Connect ${discoveredAccounts.length} ${discoveredAccounts.length === 1 ? "account" : "accounts"}`}
                </Button>
              </DialogFooter>
            </>
          )}

          {step === "success" && (
            <>
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <div className="flex size-11 items-center justify-center rounded-full bg-positive/15 text-positive">
                  <Check className="size-6" />
                </div>
                <DialogTitle>Connected</DialogTitle>
                <p className="text-sm text-muted-foreground">
                  {institutionLabel || "Your account"} is linked. First sync is running now —
                  transactions will appear in a moment.
                </p>
              </div>
              <DialogFooter>
                <Button className="w-full" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
