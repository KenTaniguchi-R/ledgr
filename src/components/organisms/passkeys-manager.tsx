"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Fingerprint } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

type Passkey = {
  id: string;
  name?: string | null;
  createdAt?: string | Date | null;
};

/** A friendly default name for a newly-registered passkey, based on the platform. */
function defaultPasskeyName(): string {
  if (typeof navigator === "undefined") return "Passkey";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS device";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android device";
  if (/Windows/.test(ua)) return "Windows device";
  return "Passkey";
}

function formatDate(value: Passkey["createdAt"]): string | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function PasskeysManager() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  const refresh = useCallback(async () => {
    const res = await authClient.passkey.listUserPasskeys();
    setPasskeys((res.data as Passkey[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    async function init() {
      if (typeof window !== "undefined" && !window.PublicKeyCredential) {
        setSupported(false);
        setLoading(false);
        return;
      }
      await refresh();
    }
    void init();
  }, [refresh]);

  async function handleAdd() {
    setBusy(true);
    setError(null);
    try {
      const res = await authClient.passkey.addPasskey({
        name: defaultPasskeyName(),
      });
      if (res?.error) {
        setError("Couldn't add that passkey. Please try again.");
        return;
      }
      await refresh();
    } catch {
      // User cancelled the browser prompt, or the device declined.
      setError("Passkey setup was cancelled.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await authClient.passkey.deletePasskey({ id });
      if (res?.error) {
        setError("Couldn't remove that passkey. Please try again.");
        return;
      }
      await refresh();
    } catch {
      setError("Couldn't remove that passkey. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="rounded-lg border"
      aria-labelledby="passkeys-title"
    >
      <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
            <Fingerprint className="size-4" />
          </span>
          <div>
            <h2 id="passkeys-title" className="text-sm font-semibold">
              Passkeys
            </h2>
            <p className="text-sm text-muted-foreground">
              Phishing-resistant sign-in with your device biometrics or a
              security key.
            </p>
          </div>
        </div>
        {passkeys.length > 0 ? (
          <span className="whitespace-nowrap rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
            {passkeys.length} active
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 px-5 py-4">
        {!supported ? (
          <p className="text-sm text-muted-foreground">
            This browser doesn&apos;t support passkeys. Try a recent version of
            Safari, Chrome, or Edge.
          </p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : passkeys.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No passkeys yet. Add one to sign in with Face ID, Touch ID, or a
            security key — no password needed.
          </p>
        ) : (
          <ul className="divide-y">
            {passkeys.map((pk) => {
              const created = formatDate(pk.createdAt);
              return (
                <li
                  key={pk.id}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span className="flex size-8 items-center justify-center rounded-md bg-muted">
                    <KeyRound className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {pk.name || "Passkey"}
                    </div>
                    {created ? (
                      <div className="text-xs text-muted-foreground">
                        Added {created}
                      </div>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={() => handleRemove(pk.id)}
                  >
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {supported ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              Your password still works for recovery.
            </p>
            <Button type="button" onClick={handleAdd} disabled={busy}>
              {busy ? "Working…" : "Add a passkey"}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
