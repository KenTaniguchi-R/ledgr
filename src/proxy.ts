import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const publicPaths = ["/login", "/signup", "/api/auth", "/api/health", "/api/plaid/oauth-return", "/api/plaid/webhook", "/.well-known", "/api/mcp", "/manifest.json", "/robots.txt"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const session = getSessionCookie(request);

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    const callbackUrl = pathname + (request.nextUrl.search || "");
    loginUrl.searchParams.set("callbackUrl", callbackUrl);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // `public/` files are served at the URL root (not under a `/public` prefix), so
  // excluding the literal segment "public" here matches nothing — exclude by
  // static file extension instead.
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|svg|json|txt|xml|webmanifest)$).*)"],
};
