import { NextResponse } from "next/server";
import { revokeToken } from "@/lib/mcp/auth/oauth-server";

export async function POST(request: Request) {
  const body = await request.formData().catch(() => null);
  const params = body ? Object.fromEntries(body.entries()) : await request.json();
  const token = params.token as string;
  if (token) revokeToken(token);
  return new NextResponse(null, { status: 200 });
}
