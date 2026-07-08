"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import {
  deleteFinancialDataAction,
  deleteAccountAction,
} from "@/actions/account-deletion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";

type DangerActionProps = {
  triggerLabel: string;
  triggerVariant: "outline" | "destructive";
  title: string;
  description: string;
  consequences: string[];
  keep?: string;
  confirmPhrase: string;
  confirmLabel: string;
  onConfirm: () => Promise<{ error?: string; success?: true }>;
  onSuccess: () => void | Promise<void>;
};

function DangerAction({
  triggerLabel,
  triggerVariant,
  title,
  description,
  consequences,
  keep,
  confirmPhrase,
  confirmLabel,
  onConfirm,
  onSuccess,
}: DangerActionProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = text.trim().toLowerCase() === confirmPhrase.toLowerCase();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setText("");
      setError(null);
      setPending(false);
    }
  }

  async function handleConfirm() {
    if (!confirmed || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await onConfirm();
      if (res?.error) {
        setError(res.error);
        setPending(false);
        return;
      }
      await onSuccess();
      // Success paths either navigate away or refresh; close defensively.
      handleOpenChange(false);
    } catch {
      setError("Something went wrong. Please try again.");
      setPending(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </Button>
      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>

          <ul className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-left">
            {consequences.map((c) => (
              <li key={c} className="flex gap-2 py-0.5">
                <span aria-hidden className="text-destructive font-bold">
                  &ndash;
                </span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
          {keep ? (
            <p className="-mt-2 text-sm text-muted-foreground text-left">{keep}</p>
          ) : null}

          <div className="text-left">
            <Label htmlFor="danger-confirm" className="text-sm">
              Type{" "}
              <span className="font-mono font-medium text-foreground">
                {confirmPhrase}
              </span>{" "}
              to confirm
            </Label>
            <Input
              id="danger-confirm"
              autoComplete="off"
              value={text}
              placeholder={confirmPhrase}
              onChange={(e) => setText(e.target.value)}
              className="mt-1.5"
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive text-left" role="alert">
              {error}
            </p>
          ) : null}

          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirm}
              disabled={!confirmed || pending}
            >
              {pending ? "Working…" : confirmLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function DangerZone() {
  const router = useRouter();

  return (
    <section
      className="rounded-lg border border-destructive/30 overflow-hidden"
      aria-labelledby="danger-zone-title"
    >
      <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/5 px-5 py-3">
        <span
          aria-hidden
          className="size-2 rounded-full bg-destructive shrink-0"
        />
        <h2 id="danger-zone-title" className="text-sm font-semibold">
          Danger zone
        </h2>
      </div>

      <div className="divide-y">
        <div className="flex items-center justify-between gap-5 px-5 py-4">
          <div>
            <h3 className="text-sm font-medium">Delete all financial data</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              Disconnects every bank and erases all accounts, transactions,
              balances, and investment records. Your login, categories, and
              budgets are kept.
            </p>
          </div>
          <DangerAction
            triggerLabel="Delete data"
            triggerVariant="outline"
            title="Delete all financial data?"
            description="This disconnects your banks at Plaid and erases financial records from your instance."
            consequences={[
              "Revokes all Plaid connections (banks stop syncing)",
              "Deletes every account, transaction, and split",
              "Deletes investment holdings, history, and balances",
              "Deletes detected recurring bills",
            ]}
            keep="Kept: your login, custom categories, and budgets."
            confirmPhrase="DELETE"
            confirmLabel="Delete data"
            onConfirm={deleteFinancialDataAction}
            onSuccess={() => router.refresh()}
          />
        </div>

        <div className="flex items-center justify-between gap-5 px-5 py-4">
          <div>
            <h3 className="text-sm font-medium">Delete account</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              Permanently erases everything — your financial data and your Ledgr
              login. This cannot be undone.
            </p>
          </div>
          <DangerAction
            triggerLabel="Delete account"
            triggerVariant="destructive"
            title="Delete your account?"
            description="This permanently erases everything and signs you out. It cannot be undone."
            consequences={[
              "Revokes all Plaid connections",
              "Deletes all financial data (accounts, transactions, investments)",
              "Deletes categories, budgets, and saved reports",
              "Deletes your login, sessions, and connected AI clients",
            ]}
            confirmPhrase="delete my account"
            confirmLabel="Delete account forever"
            onConfirm={deleteAccountAction}
            onSuccess={async () => {
              await authClient.signOut();
              router.push("/login");
            }}
          />
        </div>
      </div>
    </section>
  );
}
