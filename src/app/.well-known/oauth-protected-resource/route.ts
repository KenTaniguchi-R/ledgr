import { NextResponse } from "next/server";
import { MCP_SCOPES } from "@/lib/mcp/constants";

export function GET() {
  const ledgrUrl = process.env.LEDGR_URL ?? "http://localhost:3000";

  return NextResponse.json({
    resource: ledgrUrl,
    authorization_servers: [ledgrUrl],
    scopes_supported: MCP_SCOPES,
    bearer_methods_supported: ["header"],
  });
}
