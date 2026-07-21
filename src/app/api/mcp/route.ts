import { NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/server";
import { authenticateRequest } from "@/lib/mcp/auth/oauth-server";
import { registerAllTools } from "@/lib/mcp/tools/index";
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

  const server = createMcpServer();
  registerAllTools(server, claims);

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export async function GET() {
  return NextResponse.json({ error: "Use POST for Streamable HTTP transport" }, { status: 405 });
}
