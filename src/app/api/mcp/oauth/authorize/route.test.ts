import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/mcp/auth/oauth-server", () => ({
  getClient: vi.fn(async () => ({ clientId: "test-client", clientName: "Test" })),
}));

const PARAMS = new URLSearchParams({
  response_type: "code",
  client_id: "test-client",
  redirect_uri: "http://localhost:3118/callback",
  code_challenge: "fwnE7xUvWz_QhEToQ2JeHkc-SUaVs5ojee3GwQjWpjk",
  code_challenge_method: "S256",
  state: "opaque-state",
  scope: "ledgr:read",
});

// The container binds 0.0.0.0:3000 (Dockerfile/compose map host 4200 -> 3000),
// so Next builds `request.url` from that internal address. A consent redirect
// derived from it sends the browser to an unreachable host.
const INTERNAL_ORIGIN = "http://0.0.0.0:3000";

describe("GET /api/mcp/oauth/authorize", () => {
  beforeEach(() => {
    vi.stubEnv("LEDGR_URL", "http://localhost:4200");
  });

  it("points the consent redirect at LEDGR_URL, not the internal bind address", async () => {
    const { GET } = await import("./route");

    const res = await GET(new Request(`${INTERNAL_ORIGIN}/api/mcp/oauth/authorize?${PARAMS}`));

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe("http://localhost:4200");
    expect(location.pathname).toBe("/mcp/authorize");
  });

  it("carries the OAuth parameters through to the consent screen", async () => {
    const { GET } = await import("./route");

    const res = await GET(new Request(`${INTERNAL_ORIGIN}/api/mcp/oauth/authorize?${PARAMS}`));

    const forwarded = new URL(res.headers.get("location")!).searchParams;
    expect(forwarded.get("client_id")).toBe("test-client");
    expect(forwarded.get("redirect_uri")).toBe("http://localhost:3118/callback");
    expect(forwarded.get("code_challenge")).toBe(PARAMS.get("code_challenge"));
    expect(forwarded.get("state")).toBe("opaque-state");
    expect(forwarded.get("scope")).toBe("ledgr:read");
  });

  it("honours a LEDGR_URL served from a non-localhost origin", async () => {
    vi.stubEnv("LEDGR_URL", "https://ledgr.example.com");
    const { GET } = await import("./route");

    const res = await GET(new Request(`${INTERNAL_ORIGIN}/api/mcp/oauth/authorize?${PARAMS}`));

    expect(new URL(res.headers.get("location")!).origin).toBe("https://ledgr.example.com");
  });
});
