import { NextResponse } from "next/server";
import { exchangeCode, refreshAccessToken, OAuthError } from "@/lib/mcp/auth/oauth-server";

export async function POST(request: Request) {
  try {
    const body = await request.formData().catch(() => null);
    const params = body ? Object.fromEntries(body.entries()) : await request.json();
    const grantType = params.grant_type;

    if (grantType === "authorization_code") {
      const result = await exchangeCode({
        code: params.code, clientId: params.client_id,
        codeVerifier: params.code_verifier, redirectUri: params.redirect_uri,
        resource: params.resource,
      });
      return NextResponse.json(result);
    }

    if (grantType === "refresh_token") {
      const result = await refreshAccessToken({
        refreshToken: params.refresh_token, clientId: params.client_id,
        resource: params.resource,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
  } catch (e) {
    if (e instanceof OAuthError) return NextResponse.json(e.toJSON(), { status: 400 });
    return NextResponse.json({ error: "server_error", error_description: "Internal error" }, { status: 500 });
  }
}
