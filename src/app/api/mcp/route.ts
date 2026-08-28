import { NextResponse } from "next/server";
import { mcpHandler } from "@/lib/mcp/server";
import { authenticateRequest } from "@/lib/mcp/auth/oauth-server";
import { getLedgrUrl } from "@/lib/mcp/constants";

export async function POST(request: Request) {
  if (process.env.MCP_ENABLED !== "true") {
    return NextResponse.json({ error: "MCP is disabled" }, { status: 403 });
  }

  // DNS-rebinding defense: browser-originated requests must come from our own
  // origin. Non-browser MCP clients send no Origin header and skip this check.
  const origin = request.headers.get("Origin");
  if (origin !== null && origin !== new URL(getLedgrUrl()).origin) {
    return NextResponse.json({ error: "Invalid Origin" }, { status: 403 });
  }

  const claims = await authenticateRequest(request);
  if (!claims) {
    return new NextResponse(null, {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer realm="ledgr", resource_metadata="${getLedgrUrl()}/.well-known/oauth-protected-resource/api/mcp"`,
      },
    });
  }

  const scopes = claims.scope.split(" ");
  if (!scopes.includes("ledgr:read")) {
    return NextResponse.json({ error: "insufficient_scope" }, { status: 403 });
  }

  const token = request.headers.get("Authorization")!.slice(7);
  return mcpHandler.fetch(request, {
    authInfo: {
      token,
      clientId: claims.sub,
      scopes,
      resource: new URL(`${getLedgrUrl()}/api/mcp`),
      extra: { claims },
    },
  });
}

export const GET = POST;
