import { NextResponse } from "next/server";
import { getClient } from "@/lib/mcp/auth/oauth-server";
import { DEFAULT_SCOPE } from "@/lib/mcp/constants";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod = url.searchParams.get("code_challenge_method");
  const scope = url.searchParams.get("scope") ?? DEFAULT_SCOPE;
  const state = url.searchParams.get("state");

  if (!clientId || !redirectUri || !codeChallenge) {
    return NextResponse.json({ error: "invalid_request", error_description: "Missing required parameters" }, { status: 400 });
  }
  if (codeChallengeMethod !== "S256") {
    return NextResponse.json({ error: "invalid_request", error_description: "Only S256 code_challenge_method supported" }, { status: 400 });
  }
  const client = await getClient(clientId);
  if (!client) {
    return NextResponse.json({ error: "invalid_client", error_description: "Unknown client_id" }, { status: 400 });
  }

  const consentUrl = new URL("/mcp/authorize", request.url);
  consentUrl.searchParams.set("client_id", clientId);
  consentUrl.searchParams.set("redirect_uri", redirectUri);
  consentUrl.searchParams.set("code_challenge", codeChallenge);
  consentUrl.searchParams.set("scope", scope);
  if (state) consentUrl.searchParams.set("state", state);

  return NextResponse.redirect(consentUrl);
}
