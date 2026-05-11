import { describe, it, expect } from "vitest";
import { signAccessToken, verifyAccessToken, generateRefreshToken } from "./token";

describe("JWT tokens", () => {
  it("round-trips a signed JWT with correct claims", async () => {
    const token = await signAccessToken({
      userId: "user-1",
      householdId: "hh-1",
      scope: "ledgr:read ledgr:write",
    });

    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);

    const claims = await verifyAccessToken(token);
    expect(claims.sub).toBe("user-1");
    expect(claims.household_id).toBe("hh-1");
    expect(claims.scope).toBe("ledgr:read ledgr:write");
  });

  it("rejects an expired token", async () => {
    const token = await signAccessToken({
      userId: "user-1",
      householdId: "hh-1",
      scope: "ledgr:read",
      expiresInSeconds: -1,
    });

    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it("generates a random refresh token string", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });
});
