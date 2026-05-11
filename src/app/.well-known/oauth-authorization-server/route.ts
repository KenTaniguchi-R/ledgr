import { NextResponse } from "next/server";

export function GET() {
  const ledgrUrl = process.env.LEDGR_URL ?? "http://localhost:3000";

  return NextResponse.json({
    issuer: "ledgr",
    authorization_endpoint: `${ledgrUrl}/api/mcp/oauth/authorize`,
    token_endpoint: `${ledgrUrl}/api/mcp/oauth/token`,
    registration_endpoint: `${ledgrUrl}/api/mcp/oauth/register`,
    revocation_endpoint: `${ledgrUrl}/api/mcp/oauth/revoke`,
    scopes_supported: ["ledgr:read", "ledgr:write", "ledgr:sync"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    service_documentation: `${ledgrUrl}/docs`,
  });
}
