import { NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/server";
import { authenticateRequest } from "@/lib/mcp/auth/oauth-server";
import { registerAllTools } from "@/lib/mcp/tools/index";

export async function POST(request: Request) {
  if (process.env.MCP_ENABLED !== "true") {
    return NextResponse.json({ error: "MCP is disabled" }, { status: 403 });
  }

  const claims = await authenticateRequest(request);
  if (!claims) {
    return new NextResponse(null, {
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer realm="ledgr"' },
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
