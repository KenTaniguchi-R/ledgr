import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "./setup";
import type { LedgrDb } from "@/db";
import { registerClient, createAuthorizationCode, exchangeCode, refreshAccessToken } from "@/lib/mcp/auth/oauth-server";
import { getLedgrUrl, getMcpResourceUrl } from "@/lib/mcp/constants";
import { createHash } from "crypto";

const LEDGR_URL = getLedgrUrl();
const MCP_RESOURCE = `${LEDGR_URL}/api/mcp`;

describe("OAuth discovery metadata (RFC 8414 / RFC 9728)", () => {
  it("authorization server metadata uses the server URL as issuer", async () => {
    const { GET } = await import("@/app/.well-known/oauth-authorization-server/route");
    const body = await GET().json();
    expect(body.issuer).toBe(LEDGR_URL);
  });

  it("protected resource metadata identifies the MCP endpoint as the resource", async () => {
    const { GET } = await import("@/app/.well-known/oauth-protected-resource/route");
    const body = await GET().json();
    expect(body.resource).toBe(MCP_RESOURCE);
    expect(body.authorization_servers).toEqual([LEDGR_URL]);
  });

  it("serves protected resource metadata at the RFC 9728 path-suffixed well-known URI", async () => {
    const { GET } = await import("@/app/.well-known/oauth-protected-resource/api/mcp/route");
    const body = await GET().json();
    expect(body.resource).toBe(MCP_RESOURCE);
  });

  it("getMcpResourceUrl returns the canonical MCP endpoint URL", () => {
    expect(getMcpResourceUrl()).toBe(MCP_RESOURCE);
  });
});

describe("MCP endpoint transport security", () => {
  let previousMcpEnabled: string | undefined;

  beforeAll(() => {
    previousMcpEnabled = process.env.MCP_ENABLED;
    process.env.MCP_ENABLED = "true";
  });

  afterAll(() => {
    if (previousMcpEnabled === undefined) delete process.env.MCP_ENABLED;
    else process.env.MCP_ENABLED = previousMcpEnabled;
  });

  it("401 response advertises the resource metadata URL in WWW-Authenticate", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(new Request(`${LEDGR_URL}/api/mcp`, { method: "POST" }));
    expect(res.status).toBe(401);
    const header = res.headers.get("WWW-Authenticate");
    expect(header).toContain(
      `resource_metadata="${LEDGR_URL}/.well-known/oauth-protected-resource/api/mcp"`,
    );
  });

  it("rejects requests with a mismatched Origin header with 403", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(
      new Request(`${LEDGR_URL}/api/mcp`, {
        method: "POST",
        headers: { Origin: "https://attacker.evil" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("allows requests whose Origin matches the server origin", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(
      new Request(`${LEDGR_URL}/api/mcp`, {
        method: "POST",
        headers: { Origin: new URL(LEDGR_URL).origin },
      }),
    );
    // Passes the Origin check and proceeds to token auth, which fails with 401 (not 403)
    expect(res.status).toBe(401);
  });
});

describe("Resource indicators (RFC 8707)", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY ??= "test-key-for-jwt-signing-32chars!!";
    ({ db, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  async function issueCode() {
    const client = await registerClient({ redirect_uris: ["http://localhost:8080/cb"] }, db);
    const codeVerifier = "resource-indicator-test-verifier-string";
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    const code = await createAuthorizationCode(
      {
        clientId: client.client_id, userId: "u-rfc8707", householdId: "hh-rfc8707",
        scope: "ledgr:read", codeChallenge, redirectUri: "http://localhost:8080/cb",
      },
      db,
    );
    return { client, code, codeVerifier };
  }

  it("rejects a code exchange whose resource parameter is not the MCP endpoint", async () => {
    const { client, code, codeVerifier } = await issueCode();
    await expect(
      exchangeCode(
        {
          code, clientId: client.client_id, codeVerifier,
          redirectUri: "http://localhost:8080/cb", resource: "https://other-server.example/mcp",
        },
        db,
      ),
    ).rejects.toMatchObject({ code: "invalid_target" });
  });

  it("accepts a code exchange with the canonical resource and binds the token audience to it", async () => {
    const { client, code, codeVerifier } = await issueCode();
    const tokens = await exchangeCode(
      {
        code, clientId: client.client_id, codeVerifier,
        redirectUri: "http://localhost:8080/cb", resource: MCP_RESOURCE,
      },
      db,
    );
    const payload = JSON.parse(Buffer.from(tokens.access_token.split(".")[1], "base64url").toString());
    expect(payload.aud).toBe(MCP_RESOURCE);
  });

  it("rejects a refresh whose resource parameter is not the MCP endpoint", async () => {
    const { client, code, codeVerifier } = await issueCode();
    const tokens = await exchangeCode(
      { code, clientId: client.client_id, codeVerifier, redirectUri: "http://localhost:8080/cb" },
      db,
    );
    await expect(
      refreshAccessToken(
        {
          refreshToken: tokens.refresh_token, clientId: client.client_id,
          resource: "https://other-server.example/mcp",
        },
        db,
      ),
    ).rejects.toMatchObject({ code: "invalid_target" });
  });

  it("authorize endpoint rejects a mismatched resource parameter with invalid_target", async () => {
    const { GET } = await import("@/app/api/mcp/oauth/authorize/route");
    const url = new URL(`${LEDGR_URL}/api/mcp/oauth/authorize`);
    url.searchParams.set("client_id", "any-client");
    url.searchParams.set("redirect_uri", "http://localhost:8080/cb");
    url.searchParams.set("code_challenge", "x");
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("resource", "https://other-server.example/mcp");
    const res = await GET(new Request(url));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_target");
  });
});
