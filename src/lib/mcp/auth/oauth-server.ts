import { db as defaultDb } from "@/db";
import type { LedgrDb } from "@/db";
import { oauthClients, oauthCodes, oauthRefreshTokens, oauthConsents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";
import { nowISO } from "@/lib/date-utils";
import { signAccessToken, generateRefreshToken, verifyAccessToken } from "./token";
import type { AccessTokenClaims } from "./token";

function generateId(): string {
  return randomBytes(16).toString("base64url");
}

export interface RegisterClientInput {
  client_name?: string;
  redirect_uris: string[];
}

export async function registerClient(
  input: RegisterClientInput,
  db: LedgrDb = defaultDb,
) {
  if (!input.redirect_uris?.length) {
    throw new OAuthError("invalid_request", "redirect_uris required");
  }
  const id = generateId();
  const clientId = generateId();
  db.insert(oauthClients)
    .values({
      id,
      clientId,
      clientName: input.client_name ?? null,
      redirectUris: JSON.stringify(input.redirect_uris),
      createdAt: nowISO(),
    })
    .run();
  return { client_id: clientId, client_name: input.client_name ?? null };
}

export interface CreateCodeInput {
  clientId: string;
  userId: string;
  householdId: string;
  scope: string;
  codeChallenge: string;
  redirectUri: string;
}

export function createAuthorizationCode(
  input: CreateCodeInput,
  db: LedgrDb = defaultDb,
): string {
  const client = db
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.clientId, input.clientId))
    .get();
  if (!client) throw new OAuthError("invalid_client", "Unknown client_id");
  const uris: string[] = JSON.parse(client.redirectUris);
  if (!uris.includes(input.redirectUri)) {
    throw new OAuthError("invalid_request", "redirect_uri not registered");
  }
  const code = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.insert(oauthCodes)
    .values({
      code,
      clientId: input.clientId,
      userId: input.userId,
      householdId: input.householdId,
      scope: input.scope,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: "S256",
      redirectUri: input.redirectUri,
      expiresAt,
      used: 0,
    })
    .run();
  return code;
}

export interface ExchangeCodeInput {
  code: string;
  clientId: string;
  codeVerifier: string;
  redirectUri: string;
}

export async function exchangeCode(
  input: ExchangeCodeInput,
  db: LedgrDb = defaultDb,
) {
  const row = db.select().from(oauthCodes).where(eq(oauthCodes.code, input.code)).get();
  if (!row) throw new OAuthError("invalid_grant", "Unknown code");
  if (row.used) throw new OAuthError("invalid_grant", "Code already used");
  if (new Date(row.expiresAt) < new Date()) throw new OAuthError("invalid_grant", "Code expired");
  if (row.clientId !== input.clientId) throw new OAuthError("invalid_grant", "client_id mismatch");
  if (row.redirectUri !== input.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri mismatch");

  const expectedChallenge = createHash("sha256").update(input.codeVerifier).digest("base64url");
  if (expectedChallenge !== row.codeChallenge) throw new OAuthError("invalid_grant", "PKCE verification failed");

  db.update(oauthCodes).set({ used: 1 }).where(eq(oauthCodes.code, input.code)).run();

  const accessToken = await signAccessToken({ userId: row.userId, householdId: row.householdId, scope: row.scope });
  const refreshToken = generateRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  db.insert(oauthRefreshTokens).values({
    token: refreshToken, clientId: input.clientId, userId: row.userId,
    householdId: row.householdId, scope: row.scope, expiresAt: refreshExpiresAt, revoked: 0,
  }).run();

  return { access_token: accessToken, token_type: "Bearer", expires_in: 3600, refresh_token: refreshToken, scope: row.scope };
}

export interface RefreshInput {
  refreshToken: string;
  clientId: string;
}

export async function refreshAccessToken(input: RefreshInput, db: LedgrDb = defaultDb) {
  const row = db.select().from(oauthRefreshTokens).where(eq(oauthRefreshTokens.token, input.refreshToken)).get();
  if (!row) throw new OAuthError("invalid_grant", "Unknown refresh token");
  if (row.revoked) throw new OAuthError("invalid_grant", "Token revoked");
  if (new Date(row.expiresAt) < new Date()) throw new OAuthError("invalid_grant", "Refresh token expired");
  if (row.clientId !== input.clientId) throw new OAuthError("invalid_grant", "client_id mismatch");

  db.update(oauthRefreshTokens).set({ revoked: 1 }).where(eq(oauthRefreshTokens.token, input.refreshToken)).run();

  const newRefreshToken = generateRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.insert(oauthRefreshTokens).values({
    token: newRefreshToken, clientId: input.clientId, userId: row.userId,
    householdId: row.householdId, scope: row.scope, expiresAt: refreshExpiresAt, revoked: 0,
  }).run();

  const accessToken = await signAccessToken({ userId: row.userId, householdId: row.householdId, scope: row.scope });
  return { access_token: accessToken, token_type: "Bearer", expires_in: 3600, refresh_token: newRefreshToken, scope: row.scope };
}

export function revokeToken(token: string, db: LedgrDb = defaultDb) {
  db.update(oauthRefreshTokens).set({ revoked: 1 }).where(eq(oauthRefreshTokens.token, token)).run();
}

export function hasConsent(userId: string, clientId: string, db: LedgrDb = defaultDb): boolean {
  const row = db.select().from(oauthConsents).where(and(eq(oauthConsents.userId, userId), eq(oauthConsents.clientId, clientId))).get();
  return !!row;
}

export function grantConsent(userId: string, clientId: string, scope: string, db: LedgrDb = defaultDb) {
  db.insert(oauthConsents).values({ id: generateId(), userId, clientId, scope, grantedAt: nowISO() })
    .onConflictDoUpdate({ target: [oauthConsents.userId, oauthConsents.clientId], set: { scope, grantedAt: nowISO() } }).run();
}

export function revokeConsent(userId: string, clientId: string, db: LedgrDb = defaultDb) {
  db.delete(oauthConsents).where(and(eq(oauthConsents.userId, userId), eq(oauthConsents.clientId, clientId))).run();
  db.update(oauthRefreshTokens).set({ revoked: 1 }).where(and(eq(oauthRefreshTokens.userId, userId), eq(oauthRefreshTokens.clientId, clientId))).run();
}

export function getClient(clientId: string, db: LedgrDb = defaultDb) {
  return db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).get();
}

export function getConsentsForUser(userId: string, db: LedgrDb = defaultDb) {
  return db.select({ clientId: oauthConsents.clientId, clientName: oauthClients.clientName, scope: oauthConsents.scope, grantedAt: oauthConsents.grantedAt })
    .from(oauthConsents).innerJoin(oauthClients, eq(oauthConsents.clientId, oauthClients.clientId)).where(eq(oauthConsents.userId, userId)).all();
}

export async function authenticateRequest(request: Request): Promise<AccessTokenClaims | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try { return await verifyAccessToken(authHeader.slice(7)); } catch { return null; }
}

export class OAuthError extends Error {
  constructor(public code: string, message: string) { super(message); }
  toJSON() { return { error: this.code, error_description: this.message }; }
}
