"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const AUTH_ERRORS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Invalid email or password.",
  USER_NOT_FOUND: "Invalid email or password.",
  INVALID_PASSWORD: "Invalid email or password.",
};

interface LoginFormProps {
  callbackUrl: string;
}

export function LoginForm({ callbackUrl }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [passkeyPending, setPasskeyPending] = useState(false);

  // Conditional UI: let browsers offer a saved passkey via autofill.
  useEffect(() => {
    let cancelled = false;
    async function enableAutofill() {
      if (typeof window === "undefined") return;
      const PKC = window.PublicKeyCredential as
        | (typeof window.PublicKeyCredential & {
            isConditionalMediationAvailable?: () => Promise<boolean>;
          })
        | undefined;
      if (!PKC?.isConditionalMediationAvailable) return;
      try {
        if (!(await PKC.isConditionalMediationAvailable())) return;
        const res = await authClient.signIn.passkey({ autoFill: true });
        if (!cancelled && res && !res.error) {
          router.push(callbackUrl);
        }
      } catch {
        // No passkey selected, or the flow was dismissed — ignore.
      }
    }
    void enableAutofill();
    return () => {
      cancelled = true;
    };
  }, [callbackUrl, router]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const { error } = await authClient.signIn.email({
        email,
        password,
      });

      if (error) {
        setError(AUTH_ERRORS[error.code ?? ""] ?? "Something went wrong. Please try again.");
        return;
      }

      router.push(callbackUrl);
    });
  }

  async function handlePasskey() {
    setError(null);
    setPasskeyPending(true);
    try {
      const res = await authClient.signIn.passkey();
      if (res?.error) {
        setError("Passkey sign-in failed. Try again or use your password.");
        return;
      }
      router.push(callbackUrl);
    } catch {
      setError("Passkey sign-in was cancelled.");
    } finally {
      setPasskeyPending(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={handlePasskey}
        disabled={passkeyPending || pending}
      >
        <Fingerprint className="size-4" />
        {passkeyPending ? "Waiting for passkey…" : "Sign in with a passkey"}
      </Button>

      <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            required
            autoComplete="username webauthn"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-describedby={error ? "form-error" : undefined}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={error ? "form-error" : undefined}
          />
        </div>

        <Button type="submit" className="w-full" disabled={pending || passkeyPending}>
          {pending ? "Signing in..." : "Sign in"}
        </Button>

        {error && (
          <p id="form-error" role="alert" className="text-sm text-destructive text-center">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
