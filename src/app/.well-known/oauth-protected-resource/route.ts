import { NextResponse } from "next/server";
import { MCP_SCOPES, getLedgrUrl, getMcpResourceUrl } from "@/lib/mcp/constants";

export function GET() {
  return NextResponse.json({
    resource: getMcpResourceUrl(),
    authorization_servers: [getLedgrUrl()],
    scopes_supported: MCP_SCOPES,
    bearer_methods_supported: ["header"],
  });
}
