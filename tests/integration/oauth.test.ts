import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "./setup";
import type { LedgrDb } from "@/db";
import {
  registerClient,
  createAuthorizationCode,
  exchangeCode,
  refreshAccessToken,
  grantConsent,
  hasConsent,
  revokeConsent,
} from "@/lib/mcp/auth/oauth-server";
import { verifyAccessToken } from "@/lib/mcp/auth/token";
import { createHash } from "crypto";

describe("OAuth 2.1 flow", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY ??= "test-key-for-jwt-signing-32chars!!";
    ({ db, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  it("completes the full authorization code flow with PKCE", async () => {
    const client = await registerClient(
      { client_name: "Test AI", redirect_uris: ["http://localhost:8080/callback"] },
      db,
    );
    expect(client.client_id).toBeTruthy();

    const codeVerifier = "test-verifier-string-that-is-long-enough";
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

    const code = await createAuthorizationCode(
      {
        clientId: client.client_id, userId: "user-1", householdId: "hh-1",
        scope: "ledgr:read ledgr:write", codeChallenge, redirectUri: "http://localhost:8080/callback",
      },
      db,
    );
    expect(code).toBeTruthy();

    const tokens = await exchangeCode(
      { code, clientId: client.client_id, codeVerifier, redirectUri: "http://localhost:8080/callback" },
      db,
    );
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.refresh_token).toBeTruthy();
    expect(tokens.token_type).toBe("Bearer");
    expect(tokens.expires_in).toBe(3600);

    const claims = await verifyAccessToken(tokens.access_token);
    expect(claims.sub).toBe("user-1");
    expect(claims.household_id).toBe("hh-1");
    expect(claims.scope).toBe("ledgr:read ledgr:write");

    const refreshed = await refreshAccessToken(
      { refreshToken: tokens.refresh_token, clientId: client.client_id },
      db,
    );
    expect(refreshed.access_token).toBeTruthy();
    expect(refreshed.refresh_token).not.toBe(tokens.refresh_token);

    await expect(
      refreshAccessToken({ refreshToken: tokens.refresh_token, clientId: client.client_id }, db),
    ).rejects.toThrow();
  });

  it("rejects code reuse", async () => {
    const client = await registerClient({ redirect_uris: ["http://localhost:8080/cb"] }, db);
    const codeVerifier = "another-verifier-long-enough-for-test";
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

    const code = await createAuthorizationCode(
      { clientId: client.client_id, userId: "user-2", householdId: "hh-2", scope: "ledgr:read", codeChallenge, redirectUri: "http://localhost:8080/cb" },
      db,
    );

    await exchangeCode({ code, clientId: client.client_id, codeVerifier, redirectUri: "http://localhost:8080/cb" }, db);
    await expect(
      exchangeCode({ code, clientId: client.client_id, codeVerifier, redirectUri: "http://localhost:8080/cb" }, db),
    ).rejects.toThrow("Code already used");
  });

  it("rejects wrong PKCE verifier", async () => {
    const client = await registerClient({ redirect_uris: ["http://localhost:8080/cb"] }, db);
    const codeChallenge = createHash("sha256").update("correct-verifier").digest("base64url");

    const code = await createAuthorizationCode(
      { clientId: client.client_id, userId: "user-3", householdId: "hh-3", scope: "ledgr:read", codeChallenge, redirectUri: "http://localhost:8080/cb" },
      db,
    );

    await expect(
      exchangeCode({ code, clientId: client.client_id, codeVerifier: "wrong-verifier", redirectUri: "http://localhost:8080/cb" }, db),
    ).rejects.toThrow("PKCE verification failed");
  });

  it("manages consent correctly", async () => {
    expect(await hasConsent("user-1", "client-1", db)).toBe(false);
    await grantConsent("user-1", "client-1", "ledgr:read", db);
    expect(await hasConsent("user-1", "client-1", db)).toBe(true);
    await revokeConsent("user-1", "client-1", db);
    expect(await hasConsent("user-1", "client-1", db)).toBe(false);
  });
});
