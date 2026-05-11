"use server";

import { redirect } from "next/navigation";
import { getHouseholdId, getSession } from "@/lib/auth/session";
import { grantConsent, createAuthorizationCode } from "@/lib/mcp/auth/oauth-server";

interface ApproveInput {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  state: string | null;
}

export async function approveConsent(input: ApproveInput) {
  const session = await getSession();
  if (!session?.user) throw new Error("Not authenticated");

  const householdId = await getHouseholdId();

  grantConsent(session.user.id, input.clientId, input.scope);

  const code = createAuthorizationCode({
    clientId: input.clientId,
    userId: session.user.id,
    householdId,
    scope: input.scope,
    codeChallenge: input.codeChallenge,
    redirectUri: input.redirectUri,
  });

  const url = new URL(input.redirectUri);
  url.searchParams.set("code", code);
  if (input.state) url.searchParams.set("state", input.state);

  redirect(url.toString());
}

interface DenyInput {
  redirectUri: string;
  state: string | null;
}

export async function denyConsent(input: DenyInput) {
  const url = new URL(input.redirectUri);
  url.searchParams.set("error", "access_denied");
  if (input.state) url.searchParams.set("state", input.state);

  redirect(url.toString());
}
