import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { revokeConsent } from "@/lib/mcp/auth/oauth-server";
import { z } from "zod";

const RevokeSchema = z.object({
  clientId: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = RevokeSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", details: parsed.error.flatten() }, { status: 400 });
  }

  revokeConsent(session.user.id, parsed.data.clientId);

  return NextResponse.json({ success: true });
}
