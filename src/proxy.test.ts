import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

function requestFor(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, "http://localhost:4200"));
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
