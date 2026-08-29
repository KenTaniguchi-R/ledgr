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

// Kept deliberately narrow. An earlier version excluded every path ending in a
// static-looking extension (.json, .txt, .xml, …), which would have silently
// exempted any future route such as /api/export/transactions.json from auth.
// Files served out of `public/` live at the URL root — there is no `/public`
// prefix to exclude — so name the handful of real ones instead. Anything else
// public belongs in `publicPaths` above, which is covered by tests.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|icon-\\d+\\.png).*)"],
};

/** Exported for tests: the matcher above, as a RegExp over the pathname. */
export const matcherPattern = new RegExp(`^${config.matcher[0]}$`);
