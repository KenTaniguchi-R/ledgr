import { NextResponse } from "next/server";

export function GET() {
  const ledgrUrl = process.env.LEDGR_URL ?? "http://localhost:3000";

  return NextResponse.json({
    resource: ledgrUrl,
    authorization_servers: [ledgrUrl],
    scopes_supported: ["ledgr:read", "ledgr:write", "ledgr:sync"],
    bearer_methods_supported: ["header"],
  });
}
