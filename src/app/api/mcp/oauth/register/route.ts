import { NextResponse } from "next/server";
import { registerClient, OAuthError } from "@/lib/mcp/auth/oauth-server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await registerClient(body);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof OAuthError) {
      return NextResponse.json(e.toJSON(), { status: 400 });
    }
    return NextResponse.json(
      { error: "server_error", error_description: "Internal error" },
      { status: 500 },
    );
  }
}
