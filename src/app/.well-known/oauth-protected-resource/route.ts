import { NextResponse } from "next/server";
import { MCP_SCOPES, getLedgrUrl } from "@/lib/mcp/constants";

export function GET() {
  const ledgrUrl = getLedgrUrl();

  return NextResponse.json({
    resource: ledgrUrl,
    authorization_servers: [ledgrUrl],
    scopes_supported: MCP_SCOPES,
    bearer_methods_supported: ["header"],
  });
}
