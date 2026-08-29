import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy, matcherPattern } from "@/proxy";

function requestFor(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, "http://localhost:4200"));
}

/** Mirrors what Next.js does: only run the middleware on matching paths. */
function wouldRunMiddleware(pathname: string): boolean {
  return matcherPattern.test(pathname);
}

describe("proxy", () => {
  it("does not redirect unauthenticated requests for the web app manifest", () => {
    const response = proxy(requestFor("/manifest.json"));
    expect(response.status).not.toBe(307);
  });

  it("redirects unauthenticated requests for protected pages to /login", () => {
    const response = proxy(requestFor("/dashboard"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });
});

describe("proxy matcher", () => {
  // Next.js applies config.matcher itself, so this has to be asserted against
  // the pattern directly — calling proxy() never exercises it.
  it("skips the framework and public static assets", () => {
    for (const p of ["/_next/static/chunk.js", "/_next/image", "/favicon.ico", "/icon-192.png"]) {
      expect(wouldRunMiddleware(p)).toBe(false);
    }
  });

  it("still runs for pages, API routes, and the manifest", () => {
    for (const p of ["/", "/dashboard", "/transactions", "/api/export/transactions", "/manifest.json"]) {
      expect(wouldRunMiddleware(p)).toBe(true);
    }
  });

  it("does not exempt a route merely because it ends in a static-looking extension", () => {
    // Regression guard: a broad extension exclusion here would silently take
    // routes like these outside the auth middleware entirely.
    for (const p of ["/api/export/transactions.json", "/api/reports/data.xml", "/secret.txt"]) {
      expect(wouldRunMiddleware(p)).toBe(true);
    }
  });
});
