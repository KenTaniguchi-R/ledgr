import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "crypto";
import { getLedgrUrl } from "@/lib/mcp/constants";

function getSigningKey(): Uint8Array {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY not set");
  return new TextEncoder().encode(key);
}

export interface TokenPayload {
  userId: string;
  householdId: string;
  scope: string;
  expiresInSeconds?: number;
}

export interface AccessTokenClaims {
  sub: string;
  household_id: string;
  scope: string;
}

const ISSUER = "ledgr";

export async function signAccessToken(payload: TokenPayload): Promise<string> {
  const expiresIn = payload.expiresInSeconds ?? 3600;
  const ledgrUrl = getLedgrUrl();

  return new SignJWT({
    household_id: payload.householdId,
    scope: payload.scope,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuer(ISSUER)
    .setAudience(ledgrUrl)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
    .sign(getSigningKey());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const ledgrUrl = getLedgrUrl();

  const { payload } = await jwtVerify(token, getSigningKey(), {
    issuer: ISSUER,
    audience: ledgrUrl,
  });

  return {
    sub: payload.sub!,
    household_id: payload.household_id as string,
    scope: payload.scope as string,
  };
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}
