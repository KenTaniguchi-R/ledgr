import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { revokeConsent } from "@/lib/mcp/auth/oauth-server";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const body = await request.json();
  const { clientId } = body as { clientId: string };

  if (!clientId) {
    return NextResponse.json({ error: "clientId required" }, { status: 400 });
  }

  revokeConsent(userId, clientId);

  return NextResponse.json({ success: true });
}
