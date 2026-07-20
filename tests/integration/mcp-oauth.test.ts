import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "./setup";
import { registerClient, createAuthorizationCode, OAuthError } from "@/lib/mcp/auth/oauth-server";
import type { LedgrDb } from "@/db";

describe("MCP OAuth redirect_uri validation", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;
  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });
  afterAll(() => close());

  it("rejects registration with no redirect_uris", async () => {
    await expect(registerClient({ client_name: "Evil" }, db)).rejects.toBeInstanceOf(OAuthError);
  });

  it("rejects registration with a non-https, non-loopback redirect_uri", async () => {
    await expect(
      registerClient({ client_name: "Evil", redirect_uris: ["http://attacker.evil/cb"] }, db),
    ).rejects.toBeInstanceOf(OAuthError);
  });

  it("accepts https and loopback redirect_uris", async () => {
    const r = await registerClient(
      { client_name: "Good", redirect_uris: ["https://app.example.com/cb", "http://127.0.0.1:3000/cb"] },
      db,
    );
    expect(r.redirect_uris).toContain("https://app.example.com/cb");
  });

  it("rejects an authorize-time redirect_uri not in the registered set", async () => {
    const c = await registerClient({ redirect_uris: ["https://app.example.com/cb"] }, db);
    await expect(
      createAuthorizationCode(
        {
          clientId: c.client_id,
          userId: "u1",
          householdId: "h1",
          scope: "ledgr:read",
          codeChallenge: "x",
          redirectUri: "https://attacker.evil/cb",
        },
        db,
      ),
    ).rejects.toBeInstanceOf(OAuthError);
  });

  it("accepts an exact registered redirect_uri", async () => {
    const c = await registerClient({ redirect_uris: ["https://app.example.com/cb"] }, db);
    const code = await createAuthorizationCode(
      {
        clientId: c.client_id,
        userId: "u1",
        householdId: "h1",
        scope: "ledgr:read",
        codeChallenge: "x",
        redirectUri: "https://app.example.com/cb",
      },
      db,
    );
    expect(typeof code).toBe("string");
  });
});
