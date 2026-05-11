# Ledgr AI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI integration layer (MCP server + OAuth 2.1 + Agent Skills + MCP App UI widgets) so users can connect Ledgr to AI assistants and query their finances.

**Architecture:** A single Next.js API route (`POST /api/mcp`) handles Streamable HTTP MCP traffic. OAuth 2.1 with PKCE provides auth, issuing JWTs with `household_id` claims threaded into `scopedQuery()`. 13 MCP tools delegate to existing `src/queries/*` and `src/actions/*` functions. 5 SKILL.md files teach AI assistants financial workflows. 4 interactive widgets render in AI chat iframes via MCP Apps ext-apps spec, matching the existing Ledgr design system.

**Tech Stack:** `@modelcontextprotocol/sdk`, `@modelcontextprotocol/ext-apps`, `jose` (JWT), Drizzle ORM, SQLite, React 19, Recharts, esbuild

**Spec:** `docs/superpowers/specs/2026-05-10-ai-integration-mcp-skills-design.md`

---

## Phase A: MCP Server + OAuth 2.1

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install production dependencies**

```bash
pnpm add @modelcontextprotocol/sdk jose
```

- [ ] **Step 2: Install dev dependency for widget builds (used in Phase C)**

```bash
pnpm add -D esbuild
```

- [ ] **Step 3: Verify imports resolve**

```bash
node -e "require('@modelcontextprotocol/sdk/server/mcp.js'); require('jose'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add MCP SDK and jose dependencies"
```

---

### Task 2: OAuth Database Schema

**Files:**
- Create: `src/db/schema/oauth.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Write the Drizzle schema for OAuth tables**

Create `src/db/schema/oauth.ts`:

```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const oauthClients = sqliteTable("oauth_clients", {
  id: text("id").primaryKey(),
  clientId: text("client_id").unique().notNull(),
  clientName: text("client_name"),
  redirectUris: text("redirect_uris").notNull(), // JSON array
  createdAt: text("created_at").notNull(),
});

export const oauthCodes = sqliteTable("oauth_codes", {
  code: text("code").primaryKey(),
  clientId: text("client_id").notNull(),
  userId: text("user_id").notNull(),
  householdId: text("household_id").notNull(),
  scope: text("scope").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  codeChallengeMethod: text("code_challenge_method").notNull().default("S256"),
  redirectUri: text("redirect_uri").notNull(),
  expiresAt: text("expires_at").notNull(),
  used: integer("used").notNull().default(0),
});

export const oauthRefreshTokens = sqliteTable("oauth_refresh_tokens", {
  token: text("token").primaryKey(),
  clientId: text("client_id").notNull(),
  userId: text("user_id").notNull(),
  householdId: text("household_id").notNull(),
  scope: text("scope").notNull(),
  expiresAt: text("expires_at").notNull(),
  revoked: integer("revoked").notNull().default(0),
});

export const oauthConsents = sqliteTable("oauth_consents", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  clientId: text("client_id").notNull(),
  scope: text("scope").notNull(),
  grantedAt: text("granted_at").notNull(),
});
```

- [ ] **Step 2: Re-export from schema index**

Add to `src/db/schema/index.ts`:

```typescript
export * from "./oauth";
```

- [ ] **Step 3: Generate and run migration**

```bash
pnpm db:generate
pnpm db:migrate
```

Expected: Migration creates 4 new tables.

- [ ] **Step 4: Verify tables exist**

```bash
pnpm drizzle-kit studio
```

Check `oauth_clients`, `oauth_codes`, `oauth_refresh_tokens`, `oauth_consents` appear.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/oauth.ts src/db/schema/index.ts drizzle/
git commit -m "feat: add OAuth 2.1 database schema (clients, codes, tokens, consents)"
```

---

### Task 3: JWT Token Utilities

**Files:**
- Create: `src/lib/mcp/auth/token.ts`
- Create: `src/lib/mcp/auth/token.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/mcp/auth/token.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/lib/mcp/auth/token.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/mcp/auth/token.ts`:

```typescript
import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "crypto";

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
  const ledgrUrl = process.env.LEDGR_URL ?? "http://localhost:3000";

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
  const ledgrUrl = process.env.LEDGR_URL ?? "http://localhost:3000";

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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
ENCRYPTION_KEY=test-key-for-unit-tests-32bytes!! pnpm vitest run src/lib/mcp/auth/token.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/auth/token.ts src/lib/mcp/auth/token.test.ts
git commit -m "feat: add JWT sign/verify utilities for MCP OAuth tokens"
```

---

### Task 4: OAuth Discovery Endpoints

**Files:**
- Create: `src/app/.well-known/oauth-protected-resource/route.ts`
- Create: `src/app/.well-known/oauth-authorization-server/route.ts`

- [ ] **Step 1: Create the protected resource metadata endpoint (RFC 9728)**

Create `src/app/.well-known/oauth-protected-resource/route.ts`:

```typescript
import { NextResponse } from "next/server";

export function GET() {
  const ledgrUrl = process.env.LEDGR_URL ?? "http://localhost:3000";

  return NextResponse.json({
    resource: ledgrUrl,
    authorization_servers: [ledgrUrl],
    scopes_supported: ["ledgr:read", "ledgr:write", "ledgr:sync"],
    bearer_methods_supported: ["header"],
  });
}
```

- [ ] **Step 2: Create the authorization server metadata endpoint (RFC 8414)**

Create `src/app/.well-known/oauth-authorization-server/route.ts`:

```typescript
import { NextResponse } from "next/server";

export function GET() {
  const ledgrUrl = process.env.LEDGR_URL ?? "http://localhost:3000";

  return NextResponse.json({
    issuer: "ledgr",
    authorization_endpoint: `${ledgrUrl}/api/mcp/oauth/authorize`,
    token_endpoint: `${ledgrUrl}/api/mcp/oauth/token`,
    registration_endpoint: `${ledgrUrl}/api/mcp/oauth/register`,
    revocation_endpoint: `${ledgrUrl}/api/mcp/oauth/revoke`,
    scopes_supported: ["ledgr:read", "ledgr:write", "ledgr:sync"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    service_documentation: `${ledgrUrl}/docs`,
  });
}
```

- [ ] **Step 3: Smoke test both endpoints**

```bash
pnpm dev &
sleep 3
curl -s http://localhost:3000/.well-known/oauth-protected-resource | jq .
curl -s http://localhost:3000/.well-known/oauth-authorization-server | jq .
kill %1
```

Expected: Both return valid JSON with correct URLs.

- [ ] **Step 4: Commit**

```bash
git add src/app/.well-known/
git commit -m "feat: add OAuth 2.1 discovery endpoints (.well-known)"
```

---

### Task 5: OAuth Dynamic Client Registration

**Files:**
- Create: `src/app/api/mcp/oauth/register/route.ts`
- Create: `src/lib/mcp/auth/oauth-server.ts`

- [ ] **Step 1: Write the OAuth server module with registration logic**

Create `src/lib/mcp/auth/oauth-server.ts`:

```typescript
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

// --- Client Registration (RFC 7591) ---

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

// --- Authorization Code ---

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

// --- Token Exchange ---

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
  const row = db
    .select()
    .from(oauthCodes)
    .where(eq(oauthCodes.code, input.code))
    .get();

  if (!row) throw new OAuthError("invalid_grant", "Unknown code");
  if (row.used) throw new OAuthError("invalid_grant", "Code already used");
  if (new Date(row.expiresAt) < new Date()) {
    throw new OAuthError("invalid_grant", "Code expired");
  }
  if (row.clientId !== input.clientId) {
    throw new OAuthError("invalid_grant", "client_id mismatch");
  }
  if (row.redirectUri !== input.redirectUri) {
    throw new OAuthError("invalid_grant", "redirect_uri mismatch");
  }

  // PKCE S256 verification
  const expectedChallenge = createHash("sha256")
    .update(input.codeVerifier)
    .digest("base64url");

  if (expectedChallenge !== row.codeChallenge) {
    throw new OAuthError("invalid_grant", "PKCE verification failed");
  }

  // Mark code as used
  db.update(oauthCodes)
    .set({ used: 1 })
    .where(eq(oauthCodes.code, input.code))
    .run();

  // Issue tokens
  const accessToken = await signAccessToken({
    userId: row.userId,
    householdId: row.householdId,
    scope: row.scope,
  });

  const refreshToken = generateRefreshToken();
  const refreshExpiresAt = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  db.insert(oauthRefreshTokens)
    .values({
      token: refreshToken,
      clientId: input.clientId,
      userId: row.userId,
      householdId: row.householdId,
      scope: row.scope,
      expiresAt: refreshExpiresAt,
      revoked: 0,
    })
    .run();

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: refreshToken,
    scope: row.scope,
  };
}

// --- Refresh Token ---

export interface RefreshInput {
  refreshToken: string;
  clientId: string;
}

export async function refreshAccessToken(
  input: RefreshInput,
  db: LedgrDb = defaultDb,
) {
  const row = db
    .select()
    .from(oauthRefreshTokens)
    .where(eq(oauthRefreshTokens.token, input.refreshToken))
    .get();

  if (!row) throw new OAuthError("invalid_grant", "Unknown refresh token");
  if (row.revoked) throw new OAuthError("invalid_grant", "Token revoked");
  if (new Date(row.expiresAt) < new Date()) {
    throw new OAuthError("invalid_grant", "Refresh token expired");
  }
  if (row.clientId !== input.clientId) {
    throw new OAuthError("invalid_grant", "client_id mismatch");
  }

  // Rotate: revoke old, issue new
  db.update(oauthRefreshTokens)
    .set({ revoked: 1 })
    .where(eq(oauthRefreshTokens.token, input.refreshToken))
    .run();

  const newRefreshToken = generateRefreshToken();
  const refreshExpiresAt = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  db.insert(oauthRefreshTokens)
    .values({
      token: newRefreshToken,
      clientId: input.clientId,
      userId: row.userId,
      householdId: row.householdId,
      scope: row.scope,
      expiresAt: refreshExpiresAt,
      revoked: 0,
    })
    .run();

  const accessToken = await signAccessToken({
    userId: row.userId,
    householdId: row.householdId,
    scope: row.scope,
  });

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: newRefreshToken,
    scope: row.scope,
  };
}

// --- Revocation (RFC 7009) ---

export function revokeToken(token: string, db: LedgrDb = defaultDb) {
  db.update(oauthRefreshTokens)
    .set({ revoked: 1 })
    .where(eq(oauthRefreshTokens.token, token))
    .run();
}

// --- Consent ---

export function hasConsent(
  userId: string,
  clientId: string,
  db: LedgrDb = defaultDb,
): boolean {
  const row = db
    .select()
    .from(oauthConsents)
    .where(
      and(
        eq(oauthConsents.userId, userId),
        eq(oauthConsents.clientId, clientId),
      ),
    )
    .get();
  return !!row;
}

export function grantConsent(
  userId: string,
  clientId: string,
  scope: string,
  db: LedgrDb = defaultDb,
) {
  db.insert(oauthConsents)
    .values({
      id: generateId(),
      userId,
      clientId,
      scope,
      grantedAt: nowISO(),
    })
    .onConflictDoUpdate({
      target: [oauthConsents.userId, oauthConsents.clientId],
      set: { scope, grantedAt: nowISO() },
    })
    .run();
}

export function revokeConsent(
  userId: string,
  clientId: string,
  db: LedgrDb = defaultDb,
) {
  db.delete(oauthConsents)
    .where(
      and(
        eq(oauthConsents.userId, userId),
        eq(oauthConsents.clientId, clientId),
      ),
    )
    .run();

  // Also revoke all refresh tokens for this client
  db.update(oauthRefreshTokens)
    .set({ revoked: 1 })
    .where(
      and(
        eq(oauthRefreshTokens.userId, userId),
        eq(oauthRefreshTokens.clientId, clientId),
      ),
    )
    .run();
}

// --- Client lookup ---

export function getClient(clientId: string, db: LedgrDb = defaultDb) {
  return db
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.clientId, clientId))
    .get();
}

export function getConsentsForUser(userId: string, db: LedgrDb = defaultDb) {
  return db
    .select({
      clientId: oauthConsents.clientId,
      clientName: oauthClients.clientName,
      scope: oauthConsents.scope,
      grantedAt: oauthConsents.grantedAt,
    })
    .from(oauthConsents)
    .innerJoin(oauthClients, eq(oauthConsents.clientId, oauthClients.clientId))
    .where(eq(oauthConsents.userId, userId))
    .all();
}

// --- Auth middleware helper ---

export async function authenticateRequest(
  request: Request,
): Promise<AccessTokenClaims | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  try {
    return await verifyAccessToken(token);
  } catch {
    return null;
  }
}

// --- Error class ---

export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }

  toJSON() {
    return { error: this.code, error_description: this.message };
  }
}
```

- [ ] **Step 2: Create the registration route**

Create `src/app/api/mcp/oauth/register/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { registerClient, OAuthError } from "@/lib/mcp/auth/oauth-server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await registerClient(body);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof OAuthError) {
      return NextResponse.json(e.toJSON(), { status: 400 });
    }
    return NextResponse.json(
      { error: "server_error", error_description: "Internal error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Smoke test registration**

```bash
pnpm dev &
sleep 3
curl -s -X POST http://localhost:3000/api/mcp/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"client_name":"test","redirect_uris":["http://localhost:8080/callback"]}' | jq .
kill %1
```

Expected: `{"client_id":"...","client_name":"test"}`

- [ ] **Step 4: Commit**

```bash
git add src/lib/mcp/auth/oauth-server.ts src/app/api/mcp/oauth/register/
git commit -m "feat: add OAuth 2.1 server (registration, code exchange, refresh, revocation)"
```

---

### Task 6: OAuth Token Endpoint

**Files:**
- Create: `src/app/api/mcp/oauth/token/route.ts`

- [ ] **Step 1: Create the token endpoint**

Create `src/app/api/mcp/oauth/token/route.ts`:

```typescript
import { NextResponse } from "next/server";
import {
  exchangeCode,
  refreshAccessToken,
  OAuthError,
} from "@/lib/mcp/auth/oauth-server";

export async function POST(request: Request) {
  try {
    const body = await request.formData().catch(() => null);
    const params = body
      ? Object.fromEntries(body.entries())
      : await request.json();

    const grantType = params.grant_type;

    if (grantType === "authorization_code") {
      const result = await exchangeCode({
        code: params.code,
        clientId: params.client_id,
        codeVerifier: params.code_verifier,
        redirectUri: params.redirect_uri,
      });
      return NextResponse.json(result);
    }

    if (grantType === "refresh_token") {
      const result = await refreshAccessToken({
        refreshToken: params.refresh_token,
        clientId: params.client_id,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: "unsupported_grant_type" },
      { status: 400 },
    );
  } catch (e) {
    if (e instanceof OAuthError) {
      return NextResponse.json(e.toJSON(), { status: 400 });
    }
    return NextResponse.json(
      { error: "server_error", error_description: "Internal error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/mcp/oauth/token/
git commit -m "feat: add OAuth token endpoint (authorization_code + refresh_token grants)"
```

---

### Task 7: OAuth Revocation Endpoint

**Files:**
- Create: `src/app/api/mcp/oauth/revoke/route.ts`

- [ ] **Step 1: Create the revocation endpoint (RFC 7009)**

Create `src/app/api/mcp/oauth/revoke/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { revokeToken } from "@/lib/mcp/auth/oauth-server";

export async function POST(request: Request) {
  const body = await request.formData().catch(() => null);
  const params = body
    ? Object.fromEntries(body.entries())
    : await request.json();

  const token = params.token as string;
  if (token) {
    revokeToken(token);
  }

  // RFC 7009: always return 200 regardless of whether token existed
  return new NextResponse(null, { status: 200 });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/mcp/oauth/revoke/
git commit -m "feat: add OAuth token revocation endpoint (RFC 7009)"
```

---

### Task 8: OAuth Authorization + Consent UI

**Files:**
- Create: `src/app/api/mcp/oauth/authorize/route.ts`
- Create: `src/app/mcp/authorize/page.tsx`
- Create: `src/app/mcp/authorize/consent-form.tsx`
- Create: `src/app/mcp/layout.tsx`

- [ ] **Step 1: Create the authorization endpoint (redirects to consent page)**

Create `src/app/api/mcp/oauth/authorize/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getClient, OAuthError } from "@/lib/mcp/auth/oauth-server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod = url.searchParams.get("code_challenge_method");
  const scope = url.searchParams.get("scope") ?? "ledgr:read ledgr:write ledgr:sync";
  const state = url.searchParams.get("state");

  if (!clientId || !redirectUri || !codeChallenge) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Missing required parameters" },
      { status: 400 },
    );
  }

  if (codeChallengeMethod !== "S256") {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Only S256 code_challenge_method supported" },
      { status: 400 },
    );
  }

  const client = getClient(clientId);
  if (!client) {
    return NextResponse.json(
      { error: "invalid_client", error_description: "Unknown client_id" },
      { status: 400 },
    );
  }

  // Redirect to consent page with params
  const consentUrl = new URL("/mcp/authorize", request.url);
  consentUrl.searchParams.set("client_id", clientId);
  consentUrl.searchParams.set("redirect_uri", redirectUri);
  consentUrl.searchParams.set("code_challenge", codeChallenge);
  consentUrl.searchParams.set("scope", scope);
  if (state) consentUrl.searchParams.set("state", state);

  return NextResponse.redirect(consentUrl);
}
```

- [ ] **Step 2: Create the consent page layout (outside dashboard)**

Create `src/app/mcp/layout.tsx`:

```typescript
export default function McpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Create the consent page (server component)**

Create `src/app/mcp/authorize/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getClient } from "@/lib/mcp/auth/oauth-server";
import { ConsentForm } from "./consent-form";

interface Props {
  searchParams: Promise<{
    client_id?: string;
    redirect_uri?: string;
    code_challenge?: string;
    scope?: string;
    state?: string;
  }>;
}

export default async function ConsentPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await getSession();

  if (!session?.user) {
    // Redirect to login, then back here
    const returnUrl = `/mcp/authorize?${new URLSearchParams(params as Record<string, string>).toString()}`;
    redirect(`/login?redirect=${encodeURIComponent(returnUrl)}`);
  }

  const { client_id, redirect_uri, code_challenge, scope, state } = params;

  if (!client_id || !redirect_uri || !code_challenge) {
    return <div className="text-destructive">Missing required parameters.</div>;
  }

  const client = getClient(client_id);
  if (!client) {
    return <div className="text-destructive">Unknown application.</div>;
  }

  const scopeList = (scope ?? "ledgr:read").split(" ");
  const scopeLabels: Record<string, string> = {
    "ledgr:read": "View your accounts, transactions, budgets, and reports",
    "ledgr:write": "Update transaction categories and budget allocations",
    "ledgr:sync": "Trigger bank account syncs",
  };

  return (
    <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-lg">
      <h1 className="mb-2 text-xl font-semibold">Authorize Access</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        <strong>{client.clientName ?? "An application"}</strong> wants to access
        your Ledgr financial data.
      </p>

      <div className="mb-6 space-y-2">
        <p className="text-sm font-medium">This will allow the app to:</p>
        <ul className="space-y-1">
          {scopeList.map((s) => (
            <li key={s} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 text-primary">&#10003;</span>
              <span>{scopeLabels[s] ?? s}</span>
            </li>
          ))}
        </ul>
      </div>

      <ConsentForm
        clientId={client_id}
        redirectUri={redirect_uri}
        codeChallenge={code_challenge}
        scope={scope ?? "ledgr:read"}
        state={state ?? null}
      />
    </div>
  );
}
```

- [ ] **Step 4: Create the consent form (client component with server action)**

Create `src/app/mcp/authorize/consent-form.tsx`:

```typescript
"use client";

import { useTransition } from "react";
import { approveConsent, denyConsent } from "./actions";

interface Props {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  state: string | null;
}

export function ConsentForm({
  clientId,
  redirectUri,
  codeChallenge,
  scope,
  state,
}: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex gap-3">
      <button
        className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
        disabled={isPending}
        onClick={() => {
          startTransition(() =>
            denyConsent({ redirectUri, state }),
          );
        }}
      >
        Deny
      </button>
      <button
        className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        disabled={isPending}
        onClick={() => {
          startTransition(() =>
            approveConsent({ clientId, redirectUri, codeChallenge, scope, state }),
          );
        }}
      >
        {isPending ? "..." : "Allow"}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Create the consent server actions**

Create `src/app/mcp/authorize/actions.ts`:

```typescript
"use server";

import { redirect } from "next/navigation";
import { getHouseholdId } from "@/lib/auth/session";
import { getSession } from "@/lib/auth/session";
import {
  grantConsent,
  createAuthorizationCode,
} from "@/lib/mcp/auth/oauth-server";

interface ApproveInput {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  state: string | null;
}

export async function approveConsent(input: ApproveInput) {
  const session = await getSession();
  if (!session?.user) throw new Error("Not authenticated");

  const householdId = await getHouseholdId();

  grantConsent(session.user.id, input.clientId, input.scope);

  const code = createAuthorizationCode({
    clientId: input.clientId,
    userId: session.user.id,
    householdId,
    scope: input.scope,
    codeChallenge: input.codeChallenge,
    redirectUri: input.redirectUri,
  });

  const url = new URL(input.redirectUri);
  url.searchParams.set("code", code);
  if (input.state) url.searchParams.set("state", input.state);

  redirect(url.toString());
}

interface DenyInput {
  redirectUri: string;
  state: string | null;
}

export async function denyConsent(input: DenyInput) {
  const url = new URL(input.redirectUri);
  url.searchParams.set("error", "access_denied");
  if (input.state) url.searchParams.set("state", input.state);

  redirect(url.toString());
}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/mcp/oauth/authorize/ src/app/mcp/
git commit -m "feat: add OAuth authorization endpoint and consent UI page"
```

---

### Task 9: MCP Server Factory + Route Handler

**Files:**
- Create: `src/lib/mcp/server.ts`
- Create: `src/app/api/mcp/route.ts`

- [ ] **Step 1: Create the MCP server factory**

Create `src/lib/mcp/server.ts`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AccessTokenClaims } from "./auth/token";

export function createMcpServer(): McpServer {
  return new McpServer({
    name: "ledgr",
    version: "1.0.0",
  });
}

export type ToolContext = {
  claims: AccessTokenClaims;
};
```

- [ ] **Step 2: Create the API route handler**

Create `src/app/api/mcp/route.ts`:

```typescript
import { NextResponse } from "next/server";
import {
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/server";
import { authenticateRequest } from "@/lib/mcp/auth/oauth-server";
import { registerAllTools } from "@/lib/mcp/tools/index";

export async function POST(request: Request) {
  // Check MCP is enabled
  if (process.env.MCP_ENABLED !== "true") {
    return NextResponse.json(
      { error: "MCP is disabled" },
      { status: 403 },
    );
  }

  // Authenticate
  const claims = await authenticateRequest(request);
  if (!claims) {
    return new NextResponse(null, {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Bearer realm="ledgr"',
      },
    });
  }

  // Check scope — at minimum need ledgr:read
  const scopes = claims.scope.split(" ");
  if (!scopes.includes("ledgr:read")) {
    return NextResponse.json(
      { error: "insufficient_scope" },
      { status: 403 },
    );
  }

  // Create server and register tools
  const server = createMcpServer();
  registerAllTools(server, claims);

  // Create transport and handle request
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);
  return transport.handleRequest(request);
}

// Handle GET for SSE (optional, for clients that use SSE transport)
export async function GET(request: Request) {
  return NextResponse.json(
    { error: "Use POST for Streamable HTTP transport" },
    { status: 405 },
  );
}
```

- [ ] **Step 3: Create the tool registry index (empty for now)**

Create `src/lib/mcp/tools/index.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AccessTokenClaims } from "../auth/token";

export function registerAllTools(
  server: McpServer,
  claims: AccessTokenClaims,
) {
  const householdId = claims.household_id;
  const scopes = claims.scope.split(" ");

  // Read tools (Task 10-14)
  // Write tools (Task 15-16)
  // Tools will be registered here as they're implemented
}
```

- [ ] **Step 4: Verify the route compiles**

```bash
pnpm typecheck
```

Expected: No errors in the new files.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/server.ts src/app/api/mcp/route.ts src/lib/mcp/tools/index.ts
git commit -m "feat: add MCP server factory and Streamable HTTP route handler"
```

---

### Task 10: Read Tools — Accounts & Dashboard

**Files:**
- Create: `src/lib/mcp/tools/accounts.ts`
- Create: `src/lib/mcp/tools/dashboard.ts`
- Modify: `src/lib/mcp/tools/index.ts`

- [ ] **Step 1: Create accounts tools**

Create `src/lib/mcp/tools/accounts.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAccounts, getAccountSummary } from "@/queries/accounts";
import { centsToDisplay } from "@/lib/money";

export function registerAccountTools(server: McpServer, householdId: string) {
  server.registerTool(
    "list_accounts",
    {
      title: "List Accounts",
      description:
        "List all financial accounts with current balances, types, and institution names.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      const accounts = getAccounts(householdId);

      const formatted = accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        subtype: a.subtype,
        institutionName: a.institutionName,
        balanceCents: a.currentBalance,
        balanceDisplay: centsToDisplay(a.currentBalance ?? 0, a.currency ?? "USD"),
        currency: a.currency,
        isManual: a.isManual,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(formatted, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    "get_account_summary",
    {
      title: "Account Summary",
      description:
        "Get aggregate balances by account type: total assets, total liabilities, and net worth.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      const summary = getAccountSummary(householdId);

      const result = {
        totalAssetsCents: summary.totalAssets,
        totalAssetsDisplay: centsToDisplay(summary.totalAssets),
        totalLiabilitiesCents: summary.totalLiabilities,
        totalLiabilitiesDisplay: centsToDisplay(summary.totalLiabilities),
        netWorthCents: summary.netWorth,
        netWorthDisplay: centsToDisplay(summary.netWorth),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
```

- [ ] **Step 2: Create dashboard tool**

Create `src/lib/mcp/tools/dashboard.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDashboardSummary } from "@/queries/dashboard";
import { centsToDisplay } from "@/lib/money";

export function registerDashboardTools(server: McpServer, householdId: string) {
  server.registerTool(
    "get_dashboard_summary",
    {
      title: "Dashboard Summary",
      description:
        "Get a high-level financial overview: net worth, monthly income, monthly expenses, and monthly net.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      const summary = getDashboardSummary(householdId);

      const result = {
        netWorthCents: summary.netWorth,
        netWorthDisplay: centsToDisplay(summary.netWorth),
        monthlyIncomeCents: summary.monthlyIncome,
        monthlyIncomeDisplay: centsToDisplay(summary.monthlyIncome),
        monthlyExpensesCents: summary.monthlyExpenses,
        monthlyExpensesDisplay: centsToDisplay(summary.monthlyExpenses),
        monthlyNetCents: summary.monthlyNet,
        monthlyNetDisplay: centsToDisplay(summary.monthlyNet),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
```

- [ ] **Step 3: Wire into tool registry**

Update `src/lib/mcp/tools/index.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AccessTokenClaims } from "../auth/token";
import { registerAccountTools } from "./accounts";
import { registerDashboardTools } from "./dashboard";

export function registerAllTools(
  server: McpServer,
  claims: AccessTokenClaims,
) {
  const householdId = claims.household_id;
  const scopes = claims.scope.split(" ");

  // Read tools
  if (scopes.includes("ledgr:read")) {
    registerAccountTools(server, householdId);
    registerDashboardTools(server, householdId);
  }
}
```

- [ ] **Step 4: Type check**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/tools/accounts.ts src/lib/mcp/tools/dashboard.ts src/lib/mcp/tools/index.ts
git commit -m "feat: add MCP read tools for accounts and dashboard"
```

---

### Task 11: Read Tools — Transactions

**Files:**
- Create: `src/lib/mcp/tools/transactions.ts`
- Modify: `src/lib/mcp/tools/index.ts`

- [ ] **Step 1: Create transactions tool**

Create `src/lib/mcp/tools/transactions.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getTransactions } from "@/queries/transactions";
import { centsToDisplay } from "@/lib/money";

export function registerTransactionTools(server: McpServer, householdId: string) {
  server.registerTool(
    "get_transactions",
    {
      title: "Get Transactions",
      description:
        "List transactions with optional filters. Supports cursor-based pagination (50 per page). " +
        "Filter by date range, account, category, review status, or search text.",
      inputSchema: {
        dateFrom: z.string().optional().describe("Start date (YYYY-MM-DD)"),
        dateTo: z.string().optional().describe("End date (YYYY-MM-DD)"),
        accountId: z.string().optional().describe("Filter by account ID"),
        categoryId: z.string().nullable().optional().describe("Filter by category ID (null = uncategorized)"),
        reviewed: z.boolean().optional().describe("Filter by reviewed status"),
        search: z.string().optional().describe("Search transaction names"),
        cursor: z.string().nullable().optional().describe("Pagination cursor from previous response"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async ({ dateFrom, dateTo, accountId, categoryId, reviewed, search, cursor }) => {
      const page = getTransactions(
        householdId,
        { dateFrom, dateTo, accountId, categoryId, reviewed, search },
        50,
        cursor ?? null,
      );

      const formatted = {
        transactions: page.rows.map((t) => ({
          id: t.id,
          date: t.date,
          name: t.name,
          merchantName: t.merchantName,
          categoryName: t.categoryName,
          categoryGroupName: t.categoryGroupName,
          accountName: t.accountName,
          amountCents: t.normalizedAmount,
          amountDisplay: centsToDisplay(t.normalizedAmount, t.currency),
          isIncome: t.normalizedAmount > 0,
          pending: t.pending,
          reviewed: t.reviewed,
          notes: t.notes,
        })),
        nextCursor: page.nextCursor,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(formatted, null, 2) }],
      };
    },
  );
}
```

- [ ] **Step 2: Add to index**

Add to `src/lib/mcp/tools/index.ts` imports and inside the `ledgr:read` block:

```typescript
import { registerTransactionTools } from "./transactions";
// ...inside if (scopes.includes("ledgr:read")):
    registerTransactionTools(server, householdId);
```

- [ ] **Step 3: Type check**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/mcp/tools/transactions.ts src/lib/mcp/tools/index.ts
git commit -m "feat: add MCP read tool for transactions (paginated + filtered)"
```

---

### Task 12: Read Tools — Budgets, Reports, Recurring

**Files:**
- Create: `src/lib/mcp/tools/budgets.ts`
- Create: `src/lib/mcp/tools/reports.ts`
- Create: `src/lib/mcp/tools/recurring.ts`
- Modify: `src/lib/mcp/tools/index.ts`

- [ ] **Step 1: Create budgets read tool**

Create `src/lib/mcp/tools/budgets.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getBudgetForMonth } from "@/queries/budgets";
import { centsToDisplay } from "@/lib/money";
import { getCurrentMonth } from "@/lib/date-utils";

export function registerBudgetReadTools(server: McpServer, householdId: string) {
  server.registerTool(
    "get_budget",
    {
      title: "Get Budget",
      description:
        "Get budget for a given month with category-level allocations and spending. " +
        "Returns allocated vs spent per category, grouped by category group.",
      inputSchema: {
        month: z
          .string()
          .optional()
          .describe("Month in YYYY-MM format. Defaults to current month."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async ({ month }) => {
      const m = month ?? getCurrentMonth();
      const budget = getBudgetForMonth(householdId, m);

      const result = {
        month: m,
        budgetType: budget.budget?.type ?? null,
        groups: budget.groups.map((g) => ({
          groupName: g.groupName,
          totalBudgetedCents: g.totalBudgeted,
          totalBudgetedDisplay: centsToDisplay(g.totalBudgeted),
          totalSpentCents: g.totalSpent,
          totalSpentDisplay: centsToDisplay(g.totalSpent),
          categories: g.categories.map((c) => ({
            categoryId: c.categoryId,
            categoryName: c.categoryName,
            allocatedCents: c.limitAmount,
            allocatedDisplay: centsToDisplay(c.limitAmount),
            spentCents: c.spent,
            spentDisplay: centsToDisplay(c.spent),
            remainingCents: c.remaining,
            remainingDisplay: centsToDisplay(c.remaining),
            percentUsed: c.limitAmount > 0
              ? Math.round((c.spent / c.limitAmount) * 100)
              : 0,
          })),
        })),
        unbudgetedSpentCents: budget.unbudgeted.spent,
        unbudgetedSpentDisplay: centsToDisplay(budget.unbudgeted.spent),
        summary: {
          totalBudgetedCents: budget.summary.totalBudgeted,
          totalBudgetedDisplay: centsToDisplay(budget.summary.totalBudgeted),
          totalSpentCents: budget.summary.totalSpent,
          totalSpentDisplay: centsToDisplay(budget.summary.totalSpent),
          totalRemainingCents: budget.summary.totalRemaining,
          totalRemainingDisplay: centsToDisplay(budget.summary.totalRemaining),
        },
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}

export function registerBudgetWriteTools(server: McpServer, householdId: string) {
  // Imported in Task 15
}
```

- [ ] **Step 2: Create reports tools**

Create `src/lib/mcp/tools/reports.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSpendingByCategory, getIncomeVsExpense } from "@/queries/reports";
import { centsToDisplay } from "@/lib/money";
import { getCurrentMonth, monthBounds, shiftMonth } from "@/lib/date-utils";

export function registerReportTools(server: McpServer, householdId: string) {
  server.registerTool(
    "get_spending_report",
    {
      title: "Spending Report",
      description:
        "Get spending breakdown by category for a date range. " +
        "Returns each category's total spending with optional comparison to previous period.",
      inputSchema: {
        dateFrom: z.string().describe("Start date (YYYY-MM-DD)"),
        dateTo: z.string().describe("End date (YYYY-MM-DD)"),
        accountIds: z.array(z.string()).optional().describe("Filter by account IDs"),
        categoryIds: z.array(z.string()).optional().describe("Filter by category IDs"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async ({ dateFrom, dateTo, accountIds, categoryIds }) => {
      const rows = getSpendingByCategory(householdId, {
        dateFrom,
        dateTo,
        accountIds,
        categoryIds,
      });

      const total = rows.reduce((sum, r) => sum + r.total, 0);

      const result = {
        dateFrom,
        dateTo,
        totalSpentCents: total,
        totalSpentDisplay: centsToDisplay(total),
        categories: rows.map((r) => ({
          categoryName: r.categoryName,
          groupName: r.groupName,
          amountCents: r.total,
          amountDisplay: centsToDisplay(r.total),
          percentage: total > 0 ? Math.round((r.total / total) * 100) : 0,
        })),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    "get_income_vs_expense",
    {
      title: "Income vs Expense",
      description:
        "Get monthly income vs expense comparison over a date range. " +
        "Returns income, expenses, and net for each month in the range.",
      inputSchema: {
        dateFrom: z.string().describe("Start date (YYYY-MM-DD)"),
        dateTo: z.string().describe("End date (YYYY-MM-DD)"),
        accountIds: z.array(z.string()).optional().describe("Filter by account IDs"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async ({ dateFrom, dateTo, accountIds }) => {
      const rows = getIncomeVsExpense(householdId, { dateFrom, dateTo, accountIds });

      const result = {
        dateFrom,
        dateTo,
        months: rows.map((r) => ({
          period: r.period,
          incomeCents: r.income,
          incomeDisplay: centsToDisplay(r.income),
          expensesCents: r.expenses,
          expensesDisplay: centsToDisplay(r.expenses),
          netCents: r.net,
          netDisplay: centsToDisplay(r.net),
        })),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
```

- [ ] **Step 3: Create recurring tool**

Create `src/lib/mcp/tools/recurring.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getUpcomingBills } from "@/queries/recurring";
import { centsToDisplay } from "@/lib/money";

export function registerRecurringTools(server: McpServer, householdId: string) {
  server.registerTool(
    "get_upcoming_bills",
    {
      title: "Upcoming Bills",
      description:
        "Get upcoming recurring transactions (bills and subscriptions) with amounts, " +
        "due dates, frequency, and status (overdue, due-soon, upcoming, inactive).",
      inputSchema: {
        search: z.string().optional().describe("Search by name"),
        limit: z.number().optional().describe("Max results (default 50)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async ({ search, limit }) => {
      const bills = getUpcomingBills(householdId, { search, limit: limit ?? 50 });

      const formatted = bills.map((b) => ({
        id: b.id,
        name: b.name,
        merchantName: b.merchantName,
        categoryName: b.categoryName,
        amountCents: b.lastAmount ?? b.averageAmount,
        amountDisplay: centsToDisplay(b.lastAmount ?? b.averageAmount ?? 0),
        frequency: b.frequency,
        nextDate: b.nextDate,
        status: b.status,
        isIncome: b.isIncome,
      }));

      return {
        content: [{ type: "text" as const, text: JSON.stringify(formatted, null, 2) }],
      };
    },
  );
}
```

- [ ] **Step 4: Add all three to index**

Add to `src/lib/mcp/tools/index.ts`:

```typescript
import { registerBudgetReadTools } from "./budgets";
import { registerReportTools } from "./reports";
import { registerRecurringTools } from "./recurring";

// Inside if (scopes.includes("ledgr:read")):
    registerBudgetReadTools(server, householdId);
    registerReportTools(server, householdId);
    registerRecurringTools(server, householdId);
```

- [ ] **Step 5: Type check**

```bash
pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/mcp/tools/budgets.ts src/lib/mcp/tools/reports.ts src/lib/mcp/tools/recurring.ts src/lib/mcp/tools/index.ts
git commit -m "feat: add MCP read tools for budgets, reports, and recurring bills"
```

---

### Task 13: Read Tools — Investments & Categories

**Files:**
- Create: `src/lib/mcp/tools/investments.ts`
- Create: `src/lib/mcp/tools/categories.ts`
- Modify: `src/lib/mcp/tools/index.ts`

- [ ] **Step 1: Create investments tools**

Create `src/lib/mcp/tools/investments.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getPortfolioSummary, getHoldings } from "@/queries/investments";
import { centsToDisplay } from "@/lib/money";

export function registerInvestmentTools(server: McpServer, householdId: string) {
  server.registerTool(
    "get_portfolio_summary",
    {
      title: "Portfolio Summary",
      description:
        "Get investment portfolio overview: total value, day change, total gain/loss, and cost basis.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      const summary = getPortfolioSummary(householdId);

      const result = {
        totalValueCents: summary.totalValue,
        totalValueDisplay: centsToDisplay(summary.totalValue),
        dayChangeCents: summary.dayChange,
        dayChangeDisplay: summary.dayChange != null ? centsToDisplay(summary.dayChange) : null,
        totalGainLossCents: summary.totalGainLoss,
        totalGainLossDisplay: centsToDisplay(summary.totalGainLoss),
        totalCostBasisCents: summary.totalCostBasis,
        totalCostBasisDisplay: centsToDisplay(summary.totalCostBasis),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    "get_holdings",
    {
      title: "Get Holdings",
      description:
        "Get investment holdings with ticker, quantity, current value, cost basis, and gain/loss. " +
        "View as consolidated or grouped by account.",
      inputSchema: {
        view: z.enum(["consolidated", "by-account"]).optional().describe("Grouping (default: consolidated)"),
        accountId: z.string().optional().describe("Filter by account ID"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async ({ view, accountId }) => {
      const holdings = getHoldings(
        householdId,
        view ?? "consolidated",
        accountId,
      );

      const formatted = holdings.map((h) => ({
        ticker: h.ticker,
        securityName: h.securityName,
        type: h.type,
        quantity: h.quantity,
        currentValueCents: h.currentValue,
        currentValueDisplay: centsToDisplay(h.currentValue),
        costBasisCents: h.costBasis,
        costBasisDisplay: h.costBasis != null ? centsToDisplay(h.costBasis) : null,
        gainLossCents: h.gainLoss,
        gainLossDisplay: h.gainLoss != null ? centsToDisplay(h.gainLoss) : null,
        gainLossPercent: h.gainLossPercent,
      }));

      return {
        content: [{ type: "text" as const, text: JSON.stringify(formatted, null, 2) }],
      };
    },
  );
}
```

- [ ] **Step 2: Create categories tool**

Create `src/lib/mcp/tools/categories.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getCategories } from "@/queries/categories";

export function registerCategoryReadTools(server: McpServer, householdId: string) {
  server.registerTool(
    "list_categories",
    {
      title: "List Categories",
      description:
        "List all transaction categories with their groups. " +
        "Use category IDs from this list when updating transaction categories or filtering reports.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      const categories = getCategories(householdId);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(categories, null, 2) }],
      };
    },
  );
}
```

- [ ] **Step 3: Add to index**

Add to `src/lib/mcp/tools/index.ts`:

```typescript
import { registerInvestmentTools } from "./investments";
import { registerCategoryReadTools } from "./categories";

// Inside if (scopes.includes("ledgr:read")):
    registerInvestmentTools(server, householdId);
    registerCategoryReadTools(server, householdId);
```

- [ ] **Step 4: Type check**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/tools/investments.ts src/lib/mcp/tools/categories.ts src/lib/mcp/tools/index.ts
git commit -m "feat: add MCP read tools for investments, holdings, and categories"
```

---

### Task 14: Write Tools — Category Update & Budget Set

**Files:**
- Modify: `src/lib/mcp/tools/categories.ts`
- Modify: `src/lib/mcp/tools/budgets.ts`
- Modify: `src/lib/mcp/tools/index.ts`

- [ ] **Step 1: Add update_transaction_category write tool to categories.ts**

Add to `src/lib/mcp/tools/categories.ts`:

```typescript
import { z } from "zod";
import { updateTransactionCategory } from "@/actions/transactions";

export function registerCategoryWriteTools(server: McpServer, householdId: string) {
  server.registerTool(
    "update_transaction_category",
    {
      title: "Update Transaction Category",
      description:
        "Re-categorize a transaction. Sets categorySource to 'manual'. " +
        "Use list_categories first to get valid category IDs.",
      inputSchema: {
        transactionId: z.string().describe("Transaction ID to update"),
        categoryId: z.string().nullable().describe("New category ID, or null to uncategorize"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async ({ transactionId, categoryId }) => {
      const result = await updateTransactionCategory(transactionId, categoryId);

      if ("error" in result) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: result.error }) }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: true, transactionId, categoryId }),
          },
        ],
      };
    },
  );
}
```

- [ ] **Step 2: Add set_budget_category write tool to budgets.ts**

Replace the empty `registerBudgetWriteTools` in `src/lib/mcp/tools/budgets.ts`:

```typescript
import { setBudgetCategory } from "@/actions/budgets";

export function registerBudgetWriteTools(server: McpServer, householdId: string) {
  server.registerTool(
    "set_budget_category",
    {
      title: "Set Budget Category",
      description:
        "Set or update a budget allocation for a category in a given month. " +
        "Amount is in cents (e.g., 50000 = $500.00). " +
        "Requires an existing budget for the month — use get_budget first to check.",
      inputSchema: {
        budgetId: z.string().describe("Budget ID (from get_budget response)"),
        categoryId: z.string().describe("Category ID to allocate"),
        limitAmountCents: z.number().describe("Budget limit in cents (e.g., 50000 = $500.00)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async ({ budgetId, categoryId, limitAmountCents }) => {
      const result = await setBudgetCategory(budgetId, categoryId, limitAmountCents);

      if ("error" in result) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: result.error }) }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              budgetId,
              categoryId,
              limitAmountCents,
              limitAmountDisplay: centsToDisplay(limitAmountCents),
            }),
          },
        ],
      };
    },
  );
}
```

Don't forget to add the `z` and `centsToDisplay` imports to `budgets.ts` if not already present.

- [ ] **Step 3: Wire write tools in index.ts**

Add to `src/lib/mcp/tools/index.ts`:

```typescript
import { registerCategoryWriteTools } from "./categories";
import { registerBudgetWriteTools } from "./budgets";

// After the ledgr:read block:
  if (scopes.includes("ledgr:write")) {
    registerCategoryWriteTools(server, householdId);
    registerBudgetWriteTools(server, householdId);
  }
```

- [ ] **Step 4: Type check**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/tools/categories.ts src/lib/mcp/tools/budgets.ts src/lib/mcp/tools/index.ts
git commit -m "feat: add MCP write tools for transaction categorization and budget allocation"
```

---

### Task 15: Write Tool — Sync Accounts (with Rate Limiting)

**Files:**
- Create: `src/lib/mcp/tools/sync.ts`
- Create: `src/lib/mcp/rate-limit.ts`
- Modify: `src/lib/mcp/tools/index.ts`

- [ ] **Step 1: Write the rate limit test**

Create `src/lib/mcp/rate-limit.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createTestDb } from "../../../tests/integration/setup";
import { checkSyncRateLimit } from "./rate-limit";

describe("sync rate limiting", () => {
  it("allows sync when no recent sync exists", async () => {
    const db = await createTestDb();
    const result = checkSyncRateLimit("item-1", db);
    expect(result.allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/lib/mcp/rate-limit.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create rate limit module**

Create `src/lib/mcp/rate-limit.ts`:

```typescript
import { db as defaultDb } from "@/db";
import type { LedgrDb } from "@/db";
import { syncLog } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

const SYNC_COOLDOWN_MS = 60_000; // 60 seconds

export function checkSyncRateLimit(
  plaidItemId: string,
  db: LedgrDb = defaultDb,
): { allowed: boolean; retryAfterSeconds?: number } {
  const lastSync = db
    .select({ startedAt: syncLog.startedAt })
    .from(syncLog)
    .where(eq(syncLog.plaidItemId, plaidItemId))
    .orderBy(desc(syncLog.startedAt))
    .limit(1)
    .get();

  if (!lastSync) return { allowed: true };

  const elapsed = Date.now() - new Date(lastSync.startedAt).getTime();
  if (elapsed >= SYNC_COOLDOWN_MS) return { allowed: true };

  return {
    allowed: false,
    retryAfterSeconds: Math.ceil((SYNC_COOLDOWN_MS - elapsed) / 1000),
  };
}
```

- [ ] **Step 4: Run test**

```bash
pnpm vitest run src/lib/mcp/rate-limit.test.ts
```

Expected: PASS.

- [ ] **Step 5: Create sync tool**

Create `src/lib/mcp/tools/sync.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/db";
import { plaidItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { syncInstitution } from "@/lib/plaid/sync";
import { checkSyncRateLimit } from "../rate-limit";

export function registerSyncTools(server: McpServer, householdId: string) {
  server.registerTool(
    "sync_accounts",
    {
      title: "Sync Accounts",
      description:
        "Trigger a Plaid sync for all linked bank accounts. " +
        "Fetches latest transactions and balances from the bank. " +
        "Rate-limited: once per 60 seconds per institution.",
      inputSchema: {},
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: false,
      },
    },
    async () => {
      const items = db
        .select({ id: plaidItems.id })
        .from(plaidItems)
        .where(eq(plaidItems.householdId, householdId))
        .all();

      if (items.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ message: "No linked bank accounts to sync." }),
            },
          ],
        };
      }

      const results: Array<{ itemId: string; status: string; detail?: string }> = [];

      for (const item of items) {
        const rateCheck = checkSyncRateLimit(item.id);
        if (!rateCheck.allowed) {
          results.push({
            itemId: item.id,
            status: "rate_limited",
            detail: `Retry after ${rateCheck.retryAfterSeconds}s`,
          });
          continue;
        }

        try {
          const syncResult = await syncInstitution(item.id, householdId, db);
          results.push({
            itemId: item.id,
            status: "success",
            detail: `Added: ${syncResult.added}, Modified: ${syncResult.modified}, Removed: ${syncResult.removed}`,
          });
        } catch (e) {
          results.push({
            itemId: item.id,
            status: "error",
            detail: e instanceof Error ? e.message : "Unknown error",
          });
        }
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ results }, null, 2) }],
      };
    },
  );
}
```

- [ ] **Step 6: Wire sync tool in index.ts**

Add to `src/lib/mcp/tools/index.ts`:

```typescript
import { registerSyncTools } from "./sync";

// After the ledgr:write block:
  if (scopes.includes("ledgr:sync")) {
    registerSyncTools(server, householdId);
  }
```

- [ ] **Step 7: Type check**

```bash
pnpm typecheck
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/mcp/tools/sync.ts src/lib/mcp/rate-limit.ts src/lib/mcp/rate-limit.test.ts src/lib/mcp/tools/index.ts
git commit -m "feat: add MCP sync_accounts tool with 60s rate limiting"
```

---

### Task 16: MCP Settings Toggle + Connected Clients UI

**Files:**
- Modify: `src/db/schema/households.ts` (add `mcpEnabled` to `userSettings`)
- Modify: `src/app/(dashboard)/settings/page.tsx`
- Create: `src/components/settings/mcp-settings.tsx`

This task adds the MCP consent toggle and connected clients list to the Settings page. The exact implementation depends on the current structure of `userSettings` schema and the settings page layout. The implementer should:

- [ ] **Step 1: Add `mcpEnabled` column to `userSettings` table**

Check `src/db/schema/households.ts` for the `userSettings` table. Add:

```typescript
mcpEnabled: integer("mcp_enabled").notNull().default(0),
```

- [ ] **Step 2: Generate migration**

```bash
pnpm db:generate
pnpm db:migrate
```

- [ ] **Step 3: Create MCP settings component**

Create `src/components/settings/mcp-settings.tsx`:

```typescript
"use client";

import { useTransition } from "react";

interface ConnectedClient {
  clientId: string;
  clientName: string | null;
  scope: string;
  grantedAt: string;
}

interface Props {
  mcpEnabled: boolean;
  connectedClients: ConnectedClient[];
}

export function McpSettings({ mcpEnabled, connectedClients }: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">AI Integration (MCP)</h3>
        <p className="text-sm text-muted-foreground">
          Allow AI assistants to access your financial data via the Model Context Protocol.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <p className="font-medium">MCP Access</p>
          <p className="text-sm text-muted-foreground">
            {mcpEnabled ? "AI assistants can connect" : "Disabled — no AI access"}
          </p>
        </div>
        <button
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            mcpEnabled
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              await fetch("/api/settings/mcp", {
                method: "POST",
                body: JSON.stringify({ enabled: !mcpEnabled }),
              });
              window.location.reload();
            });
          }}
        >
          {mcpEnabled ? "Enabled" : "Disabled"}
        </button>
      </div>

      {connectedClients.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium">Connected Clients</h4>
          <div className="space-y-2">
            {connectedClients.map((c) => (
              <div
                key={c.clientId}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{c.clientName ?? "Unknown App"}</p>
                  <p className="text-xs text-muted-foreground">{c.scope}</p>
                </div>
                <button
                  className="text-xs text-destructive hover:underline"
                  onClick={() => {
                    startTransition(async () => {
                      await fetch("/api/settings/mcp/revoke", {
                        method: "POST",
                        body: JSON.stringify({ clientId: c.clientId }),
                      });
                      window.location.reload();
                    });
                  }}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create the settings API routes**

Create `src/app/api/settings/mcp/route.ts` for toggling MCP on/off.
Create `src/app/api/settings/mcp/revoke/route.ts` for revoking client consent.

These routes should use `getSession()` / `getHouseholdId()`, update `userSettings.mcpEnabled`, and call `revokeConsent()` respectively.

- [ ] **Step 5: Add McpSettings to the settings page**

Modify `src/app/(dashboard)/settings/page.tsx` to import `McpSettings`, fetch `mcpEnabled` from `userSettings` and `connectedClients` from `getConsentsForUser`, and render `<McpSettings>` below the existing AI settings form.

- [ ] **Step 6: Update MCP route to check mcpEnabled**

In `src/app/api/mcp/route.ts`, after authenticating, check if the user's `mcpEnabled` setting is true. If not, return 403. Query `userSettings` using the `userId` from JWT claims.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema/households.ts src/components/settings/mcp-settings.tsx src/app/api/settings/mcp/ src/app/(dashboard)/settings/page.tsx src/app/api/mcp/route.ts drizzle/
git commit -m "feat: add MCP settings toggle and connected clients management UI"
```

---

### Task 17: OAuth Integration Test

**Files:**
- Create: `tests/integration/oauth.test.ts`

- [ ] **Step 1: Write the integration test**

Create `tests/integration/oauth.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb } from "./setup";
import type { LedgrDb } from "@/db";
import {
  registerClient,
  createAuthorizationCode,
  exchangeCode,
  refreshAccessToken,
  revokeToken,
  grantConsent,
  hasConsent,
  revokeConsent,
  getConsentsForUser,
  OAuthError,
} from "@/lib/mcp/auth/oauth-server";
import { verifyAccessToken } from "@/lib/mcp/auth/token";
import { createHash } from "crypto";

describe("OAuth 2.1 flow", () => {
  let db: LedgrDb;

  beforeAll(async () => {
    db = await createTestDb();
  });

  it("completes the full authorization code flow with PKCE", async () => {
    // 1. Register client
    const client = await registerClient(
      {
        client_name: "Test AI",
        redirect_uris: ["http://localhost:8080/callback"],
      },
      db,
    );
    expect(client.client_id).toBeTruthy();

    // 2. Create authorization code with PKCE
    const codeVerifier = "test-verifier-string-that-is-long-enough";
    const codeChallenge = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    const code = createAuthorizationCode(
      {
        clientId: client.client_id,
        userId: "user-1",
        householdId: "hh-1",
        scope: "ledgr:read ledgr:write",
        codeChallenge,
        redirectUri: "http://localhost:8080/callback",
      },
      db,
    );
    expect(code).toBeTruthy();

    // 3. Exchange code for tokens
    const tokens = await exchangeCode(
      {
        code,
        clientId: client.client_id,
        codeVerifier,
        redirectUri: "http://localhost:8080/callback",
      },
      db,
    );
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.refresh_token).toBeTruthy();
    expect(tokens.token_type).toBe("Bearer");
    expect(tokens.expires_in).toBe(3600);

    // 4. Verify JWT claims
    const claims = await verifyAccessToken(tokens.access_token);
    expect(claims.sub).toBe("user-1");
    expect(claims.household_id).toBe("hh-1");
    expect(claims.scope).toBe("ledgr:read ledgr:write");

    // 5. Refresh token
    const refreshed = await refreshAccessToken(
      { refreshToken: tokens.refresh_token, clientId: client.client_id },
      db,
    );
    expect(refreshed.access_token).toBeTruthy();
    expect(refreshed.refresh_token).not.toBe(tokens.refresh_token);

    // 6. Old refresh token should be revoked
    await expect(
      refreshAccessToken(
        { refreshToken: tokens.refresh_token, clientId: client.client_id },
        db,
      ),
    ).rejects.toThrow();
  });

  it("rejects code reuse", async () => {
    const client = await registerClient(
      { redirect_uris: ["http://localhost:8080/cb"] },
      db,
    );

    const codeVerifier = "another-verifier-long-enough-for-test";
    const codeChallenge = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    const code = createAuthorizationCode(
      {
        clientId: client.client_id,
        userId: "user-2",
        householdId: "hh-2",
        scope: "ledgr:read",
        codeChallenge,
        redirectUri: "http://localhost:8080/cb",
      },
      db,
    );

    // First exchange succeeds
    await exchangeCode(
      {
        code,
        clientId: client.client_id,
        codeVerifier,
        redirectUri: "http://localhost:8080/cb",
      },
      db,
    );

    // Second exchange fails
    await expect(
      exchangeCode(
        {
          code,
          clientId: client.client_id,
          codeVerifier,
          redirectUri: "http://localhost:8080/cb",
        },
        db,
      ),
    ).rejects.toThrow("Code already used");
  });

  it("rejects wrong PKCE verifier", async () => {
    const client = await registerClient(
      { redirect_uris: ["http://localhost:8080/cb"] },
      db,
    );

    const codeChallenge = createHash("sha256")
      .update("correct-verifier")
      .digest("base64url");

    const code = createAuthorizationCode(
      {
        clientId: client.client_id,
        userId: "user-3",
        householdId: "hh-3",
        scope: "ledgr:read",
        codeChallenge,
        redirectUri: "http://localhost:8080/cb",
      },
      db,
    );

    await expect(
      exchangeCode(
        {
          code,
          clientId: client.client_id,
          codeVerifier: "wrong-verifier",
          redirectUri: "http://localhost:8080/cb",
        },
        db,
      ),
    ).rejects.toThrow("PKCE verification failed");
  });

  it("manages consent correctly", async () => {
    expect(hasConsent("user-1", "client-1", db)).toBe(false);
    grantConsent("user-1", "client-1", "ledgr:read", db);
    expect(hasConsent("user-1", "client-1", db)).toBe(true);
    revokeConsent("user-1", "client-1", db);
    expect(hasConsent("user-1", "client-1", db)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
ENCRYPTION_KEY=test-key-for-unit-tests-32bytes!! pnpm vitest run tests/integration/oauth.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 3: Commit**

```bash
git add tests/integration/oauth.test.ts
git commit -m "test: add OAuth 2.1 integration tests (PKCE flow, code reuse, consent)"
```

---

### Task 18: Add MCP Environment Variables

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add MCP env vars to .env.example**

Add to `.env.example`:

```bash
# MCP (AI Integration)
MCP_ENABLED=false                   # Set to 'true' to enable MCP endpoint
LEDGR_URL=http://localhost:3000     # Public URL for OAuth redirects
```

- [ ] **Step 2: Add the same to your local .env**

```bash
echo "MCP_ENABLED=true" >> .env
echo "LEDGR_URL=http://localhost:3000" >> .env
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: add MCP environment variables to .env.example"
```

---

## Phase B: Skills + Plugin

### Task 19: Plugin Manifest + MCP Config

**Files:**
- Create: `ledgr-plugin/plugin.json`
- Create: `ledgr-plugin/mcp.json`

- [ ] **Step 1: Create plugin manifest**

Create `ledgr-plugin/plugin.json`:

```json
{
  "name": "ledgr",
  "version": "1.0.0",
  "description": "Connect AI assistants to your Ledgr personal finance data",
  "homepage": "https://github.com/yourusername/ledgr",
  "license": "AGPL-3.0"
}
```

- [ ] **Step 2: Create MCP connection config**

Create `ledgr-plugin/mcp.json`:

```json
{
  "ledgr": {
    "type": "streamable-http",
    "url": "${LEDGR_URL}/api/mcp",
    "auth": "oauth2"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add ledgr-plugin/plugin.json ledgr-plugin/mcp.json
git commit -m "feat: add Ledgr plugin manifest and MCP connection config"
```

---

### Task 20: Skill — Monthly Review

**Files:**
- Create: `ledgr-plugin/skills/monthly-review/SKILL.md`

- [ ] **Step 1: Write the monthly review skill**

Create `ledgr-plugin/skills/monthly-review/SKILL.md`:

```markdown
---
name: ledgr:monthly-review
description: Review monthly spending patterns and compare to previous months using Ledgr financial data
version: 1.0.0
tools:
  - get_dashboard_summary
  - get_spending_report
  - show_financial_dashboard
---

# Monthly Spending Review

## When to use

Use when the user asks to review their spending, see a monthly summary, understand where their money went, or compare spending to previous months. Trigger phrases: "review my spending", "monthly summary", "where did my money go", "spending breakdown".

## Steps

1. **Get the overview first.** Call `get_dashboard_summary` to get net worth, monthly income, expenses, and net.

2. **Get category breakdown.** Call `get_spending_report` with the current month's date range:
   - `dateFrom`: first day of current month (YYYY-MM-01)
   - `dateTo`: today's date (YYYY-MM-DD)

3. **Get previous month for comparison.** Call `get_spending_report` with the previous month's full date range for delta calculation.

4. **Calculate deltas.** For each category present in both months, compute:
   - Absolute change: current - previous (in cents)
   - Percentage change: ((current - previous) / previous) * 100
   - Sort by absolute change descending

5. **Show the visual.** Call `show_financial_dashboard` with `view: "spending-breakdown"` to render the interactive chart.

6. **Present the summary.** Format using `amountDisplay` values (never raw cents). Structure:
   - One-line overview: "You spent [totalDisplay] this month, [up/down X%] from last month"
   - Top 3 categories by spending amount
   - Top 3 categories with largest increase from previous month
   - Top 3 categories with largest decrease

## Important

- Always use `amountDisplay` fields for presenting money to the user, never raw cent values.
- Do not store or cache any financial data beyond this conversation.
- If the user has no transactions for the current month, say so clearly rather than showing empty data.
```

- [ ] **Step 2: Commit**

```bash
git add ledgr-plugin/skills/monthly-review/
git commit -m "feat: add monthly-review skill for AI spending analysis"
```

---

### Task 21: Skill — Budget Check

**Files:**
- Create: `ledgr-plugin/skills/budget-check/SKILL.md`

- [ ] **Step 1: Write the budget check skill**

Create `ledgr-plugin/skills/budget-check/SKILL.md`:

```markdown
---
name: ledgr:budget-check
description: Analyze budget vs actual spending and flag categories at risk of overspending
version: 1.0.0
tools:
  - get_budget
  - show_financial_dashboard
---

# Budget Check

## When to use

Use when the user asks about their budget, wants to know if they're on track, or asks about spending limits. Trigger phrases: "how's my budget", "am I on track", "budget status", "over budget".

## Steps

1. **Get current budget.** Call `get_budget` with no month parameter (defaults to current month).

2. **Check if budget exists.** If the response has `budgetType: null`, tell the user they haven't set up a budget for this month and suggest they do so in the Ledgr app.

3. **Calculate projections.** For each category:
   - `percentUsed` is already provided
   - Calculate days elapsed and days remaining in the month
   - Projected month-end spend: `(spentCents / daysElapsed) * totalDaysInMonth`
   - Flag if projected > allocated

4. **Identify at-risk categories.** A category is at risk if:
   - `percentUsed > 80` AND more than 10 days remain in the month
   - OR projected month-end spend exceeds allocation by >10%

5. **Identify under-budget categories.** Categories with `percentUsed < 50` and more than half the month elapsed — potential reallocation sources.

6. **Show the visual.** Call `show_financial_dashboard` with `view: "budget-progress"`.

7. **Present the summary.** Structure:
   - Overall: "You've spent [spentDisplay] of [allocatedDisplay] ([X%]) with [N] days remaining"
   - At-risk categories with projected overspend amount
   - Under-budget categories with remaining amount
   - If reallocation makes sense, suggest specific moves

## Important

- Always use `amountDisplay` fields for presenting money to the user.
- Do not store or cache any financial data beyond this conversation.
```

- [ ] **Step 2: Commit**

```bash
git add ledgr-plugin/skills/budget-check/
git commit -m "feat: add budget-check skill for AI budget analysis"
```

---

### Task 22: Skill — Subscription Audit

**Files:**
- Create: `ledgr-plugin/skills/subscription-audit/SKILL.md`

- [ ] **Step 1: Write the subscription audit skill**

Create `ledgr-plugin/skills/subscription-audit/SKILL.md`:

```markdown
---
name: ledgr:subscription-audit
description: Audit recurring charges to find subscriptions, estimate total cost, and identify savings opportunities
version: 1.0.0
tools:
  - get_upcoming_bills
---

# Subscription Audit

## When to use

Use when the user asks about subscriptions, recurring charges, or wants to find things to cancel. Trigger phrases: "what subscriptions do I have", "recurring charges", "what am I paying for monthly", "cancel subscriptions".

## Steps

1. **Get all recurring transactions.** Call `get_upcoming_bills` with `limit: 100`.

2. **Filter to expenses only.** Exclude items where `isIncome: true`.

3. **Group by frequency:**
   - Monthly
   - Annual (divide by 12 for monthly equivalent)
   - Weekly (multiply by 4.33 for monthly equivalent)

4. **Calculate total monthly recurring cost.** Sum all monthly-equivalent amounts.

5. **Flag potential issues:**
   - **Duplicates:** Two bills with the same category and similar amounts (within 10%)
   - **Inactive:** Bills with `status: "inactive"` — might be cancelled but worth confirming
   - **Large:** Any single subscription >5% of monthly income (if available from dashboard summary)

6. **Present the summary.** Structure:
   - Total monthly recurring: [amountDisplay]
   - Total annual recurring: [amountDisplay]
   - Breakdown by frequency group
   - Flagged items (duplicates, inactive, large)
   - "Which of these would you like to look into further?"

## Important

- Always use `amountDisplay` fields for presenting money to the user.
- Do not store or cache any financial data beyond this conversation.
- Do not make assumptions about which subscriptions the user should cancel — present the data and let them decide.
```

- [ ] **Step 2: Commit**

```bash
git add ledgr-plugin/skills/subscription-audit/
git commit -m "feat: add subscription-audit skill for recurring charge analysis"
```

---

### Task 23: Skill — Savings Analysis

**Files:**
- Create: `ledgr-plugin/skills/savings-analysis/SKILL.md`

- [ ] **Step 1: Write the savings analysis skill**

Create `ledgr-plugin/skills/savings-analysis/SKILL.md`:

```markdown
---
name: ledgr:savings-analysis
description: Calculate savings rate, identify top discretionary spending, and model what-if scenarios
version: 1.0.0
tools:
  - get_income_vs_expense
  - get_spending_report
  - show_financial_dashboard
---

# Savings Analysis

## When to use

Use when the user asks about savings, savings rate, how to save more, or wants spending reduction scenarios. Trigger phrases: "savings rate", "how much am I saving", "how to save more", "what if I cut spending".

## Steps

1. **Get income vs expense history.** Call `get_income_vs_expense` with the last 3 months:
   - `dateFrom`: 3 months ago, first day (YYYY-MM-01)
   - `dateTo`: today (YYYY-MM-DD)

2. **Calculate savings rate for each month:**
   - Savings = income - expenses (both in cents)
   - Rate = savings / income * 100
   - Average across the 3 months

3. **Get current month's spending breakdown.** Call `get_spending_report` for the current month.

4. **Identify top discretionary categories.** Discretionary = categories NOT in these groups: "Housing", "Utilities", "Insurance", "Debt Payments". Sort remaining by total descending.

5. **Model what-if scenarios.** For the top 3 discretionary categories:
   - "If you cut [category] by 20%: save [amountDisplay]/month, [annualDisplay]/year"
   - "If you cut [category] by 50%: save [amountDisplay]/month, [annualDisplay]/year"

6. **Show the visual.** Call `show_financial_dashboard` with `view: "net-worth-trend"` to show the income vs expense trend.

7. **Present the summary.** Structure:
   - Savings rate: [X%] average over 3 months (trending [up/down])
   - Monthly savings: [amountDisplay] average
   - Top 3 discretionary spending categories
   - What-if scenarios
   - Benchmark context: "A common target is saving 20% of income"

## Important

- Always use `amountDisplay` fields for presenting money to the user.
- Do not store or cache any financial data beyond this conversation.
- The discretionary vs non-discretionary classification is approximate. Don't be dogmatic about it.
```

- [ ] **Step 2: Commit**

```bash
git add ledgr-plugin/skills/savings-analysis/
git commit -m "feat: add savings-analysis skill for savings rate and what-if modeling"
```

---

### Task 24: Skill — Net Worth Tracking

**Files:**
- Create: `ledgr-plugin/skills/net-worth-tracking/SKILL.md`

- [ ] **Step 1: Write the net worth tracking skill**

Create `ledgr-plugin/skills/net-worth-tracking/SKILL.md`:

```markdown
---
name: ledgr:net-worth-tracking
description: Analyze net worth trends, break down by asset type, and highlight largest changes
version: 1.0.0
tools:
  - get_account_summary
  - get_dashboard_summary
  - list_accounts
  - show_financial_dashboard
---

# Net Worth Tracking

## When to use

Use when the user asks about net worth, wealth tracking, asset breakdown, or financial progress over time. Trigger phrases: "net worth", "how much am I worth", "asset breakdown", "financial progress".

## Steps

1. **Get account summary.** Call `get_account_summary` for aggregate totals (assets, liabilities, net worth).

2. **Get dashboard summary.** Call `get_dashboard_summary` for monthly income/expense context.

3. **Get account details.** Call `list_accounts` to break down by account type and institution.

4. **Group accounts by type:**
   - Liquid (checking, savings)
   - Investments (investment, brokerage, retirement)
   - Property (if any)
   - Liabilities (credit card, loan, mortgage)

5. **Calculate composition:**
   - Each group's total and percentage of gross assets or total liabilities
   - Largest single account contribution

6. **Show the visual.** Call `show_financial_dashboard` with `view: "net-worth-trend"`.

7. **Present the summary.** Structure:
   - Net worth: [amountDisplay]
   - Assets: [amountDisplay] | Liabilities: [amountDisplay]
   - Breakdown by type group with percentages
   - Monthly context: "Earning [incomeDisplay], spending [expensesDisplay], saving [netDisplay]/month"
   - Largest accounts by balance

## Important

- Always use `amountDisplay` fields for presenting money to the user.
- Do not store or cache any financial data beyond this conversation.
- Net worth can be negative — handle this gracefully in the narrative.
```

- [ ] **Step 2: Commit**

```bash
git add ledgr-plugin/skills/net-worth-tracking/
git commit -m "feat: add net-worth-tracking skill for wealth analysis"
```

---

## Phase C: MCP App UI Widgets

### Task 25: Widget Build Pipeline

**Files:**
- Create: `src/lib/mcp/apps/build.ts`
- Create: `src/lib/mcp/apps/ledgr-theme.css`
- Modify: `package.json` (add `build:mcp-widgets` script)

- [ ] **Step 1: Extract Ledgr theme CSS**

Create `src/lib/mcp/apps/ledgr-theme.css` by extracting the CSS custom properties from `src/app/globals.css`. This file contains the light and dark mode variables that widgets need:

```css
/* Extracted from globals.css — Ledgr design tokens for MCP App widgets */
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --radius: 0.625rem;
  font-family: var(--font-sans, "Geist", system-ui, sans-serif);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.145 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.145 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.985 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.269 0 0);
  --input: oklch(0.269 0 0);
  --ring: oklch(0.439 0 0);
  --chart-1: oklch(0.488 0.243 264.376);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);
}
```

**Note:** The implementer should read the actual `globals.css` and extract the exact current values. The values above are a reference — copy the real ones.

- [ ] **Step 2: Create the build script**

Create `src/lib/mcp/apps/build.ts`:

```typescript
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

const WIDGETS = [
  "spending-breakdown",
  "transaction-table",
  "budget-progress",
  "net-worth-trend",
];

const appsDir = dirname(new URL(import.meta.url).pathname);
const outDir = resolve(appsDir, "widgets");
const themeCSS = readFileSync(resolve(appsDir, "ledgr-theme.css"), "utf-8");

mkdirSync(outDir, { recursive: true });

for (const widget of WIDGETS) {
  const entryPoint = resolve(appsDir, "src", `${widget}.tsx`);

  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    minify: true,
    format: "esm",
    target: "es2022",
    write: false,
    jsx: "automatic",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
  });

  const js = result.outputFiles[0].text;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${themeCSS}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--background);color:var(--foreground);font-family:var(--font-sans,"Geist",system-ui,sans-serif)}
</style>
</head>
<body>
<div id="root"></div>
<script type="module">${js}</script>
</body>
</html>`;

  writeFileSync(resolve(outDir, `${widget}.html`), html);
  console.log(`Built ${widget}.html (${Math.round(html.length / 1024)}KB)`);
}
```

- [ ] **Step 3: Add build script to package.json**

Add to `package.json` scripts:

```json
"build:mcp-widgets": "tsx src/lib/mcp/apps/build.ts"
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/mcp/apps/build.ts src/lib/mcp/apps/ledgr-theme.css package.json
git commit -m "feat: add MCP widget build pipeline (esbuild → standalone HTML)"
```

---

### Task 26: Widget — Spending Breakdown

**Files:**
- Create: `src/lib/mcp/apps/src/spending-breakdown.tsx`
- Create: `src/lib/mcp/apps/src/app-init.ts`

- [ ] **Step 1: Create shared app initialization module**

Create `src/lib/mcp/apps/src/app-init.ts`:

```typescript
import { App, PostMessageTransport, applyDocumentTheme } from "@modelcontextprotocol/ext-apps";

export function initApp(onData: (data: unknown) => void) {
  const app = new App({ name: "Ledgr", version: "1.0.0" });

  app.ontoolinput = (input) => {
    onData((input.arguments as { data: unknown }).data);
  };

  app.onhostcontextchanged = (ctx) => {
    if (ctx.theme) {
      applyDocumentTheme(ctx.theme);
    }
  };

  app.connect(new PostMessageTransport());
}
```

- [ ] **Step 2: Create spending breakdown widget**

Create `src/lib/mcp/apps/src/spending-breakdown.tsx`:

```typescript
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { initApp } from "./app-init";

interface CategoryData {
  name: string;
  amountCents: number;
  amountDisplay: string;
  percentage: number;
  color: string;
}

interface SpendingData {
  categories: CategoryData[];
  period: string;
  totalDisplay: string;
}

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function SpendingBreakdown({ data }: { data: SpendingData }) {
  return (
    <div style={{ padding: "16px" }}>
      <div style={{ marginBottom: "12px" }}>
        <div style={{ fontSize: "14px", color: "var(--muted-foreground)" }}>
          {data.period}
        </div>
        <div style={{ fontSize: "24px", fontWeight: 600 }}>
          {data.totalDisplay}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data.categories}
            dataKey="amountCents"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            strokeWidth={2}
            stroke="var(--background)"
          >
            {data.categories.map((_, i) => (
              <Cell
                key={i}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(_, name, props) => [
              props.payload.amountDisplay,
              name,
            ]}
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              fontSize: "12px",
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      <div style={{ marginTop: "12px" }}>
        {data.categories.map((cat, i) => (
          <div
            key={cat.name}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "6px 0",
              borderBottom: "1px solid var(--border)",
              fontSize: "13px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "2px",
                  background: CHART_COLORS[i % CHART_COLORS.length],
                }}
              />
              <span>{cat.name}</span>
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <span style={{ color: "var(--muted-foreground)" }}>
                {cat.percentage}%
              </span>
              <span style={{ fontWeight: 500 }}>{cat.amountDisplay}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Root() {
  const [data, setData] = useState<SpendingData | null>(null);

  if (!data) {
    initApp((d) => setData(d as SpendingData));
    return <div style={{ padding: "16px", color: "var(--muted-foreground)" }}>Loading...</div>;
  }

  return <SpendingBreakdown data={data} />;
}

createRoot(document.getElementById("root")!).render(<Root />);
```

- [ ] **Step 3: Build and verify**

```bash
pnpm build:mcp-widgets
```

Expected: `Built spending-breakdown.html (XXkb)` output. Verify the file exists in `src/lib/mcp/apps/widgets/`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/mcp/apps/src/
git commit -m "feat: add spending breakdown MCP App widget"
```

---

### Task 27: Widget — Transaction Table

**Files:**
- Create: `src/lib/mcp/apps/src/transaction-table.tsx`

- [ ] **Step 1: Create transaction table widget**

Create `src/lib/mcp/apps/src/transaction-table.tsx`:

```typescript
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { initApp } from "./app-init";

interface TransactionRow {
  date: string;
  name: string;
  merchant: string | null;
  category: string | null;
  amountCents: number;
  amountDisplay: string;
  isIncome: boolean;
}

interface TableData {
  transactions: TransactionRow[];
  totalCount: number;
  page: number;
}

function TransactionTable({ data }: { data: TableData }) {
  const [sortKey, setSortKey] = useState<keyof TransactionRow>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = [...data.transactions].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const headerStyle = (key: keyof TransactionRow) => ({
    padding: "8px 12px",
    textAlign: "left" as const,
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: "var(--muted-foreground)",
    cursor: "pointer",
    borderBottom: "1px solid var(--border)",
    background: sortKey === key ? "var(--accent)" : "transparent",
  });

  function toggleSort(key: keyof TransactionRow) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div style={{ padding: "8px", overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr>
            <th style={headerStyle("date")} onClick={() => toggleSort("date")}>
              Date
            </th>
            <th style={headerStyle("name")} onClick={() => toggleSort("name")}>
              Description
            </th>
            <th style={headerStyle("category")} onClick={() => toggleSort("category")}>
              Category
            </th>
            <th
              style={{ ...headerStyle("amountCents"), textAlign: "right" }}
              onClick={() => toggleSort("amountCents")}
            >
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((txn, i) => (
            <tr
              key={i}
              style={{
                borderBottom: "1px solid var(--border)",
              }}
            >
              <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                {txn.date}
              </td>
              <td
                style={{
                  padding: "8px 12px",
                  maxWidth: "200px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {txn.merchant ?? txn.name}
              </td>
              <td
                style={{
                  padding: "8px 12px",
                  color: txn.category ? "var(--foreground)" : "var(--muted-foreground)",
                }}
              >
                {txn.category ?? "Uncategorized"}
              </td>
              <td
                style={{
                  padding: "8px 12px",
                  textAlign: "right",
                  fontWeight: 500,
                  fontVariantNumeric: "tabular-nums",
                  color: txn.isIncome ? "oklch(0.6 0.15 145)" : "var(--foreground)",
                }}
              >
                {txn.isIncome ? "+" : ""}{txn.amountDisplay}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.totalCount > data.transactions.length && (
        <div
          style={{
            padding: "8px 12px",
            fontSize: "12px",
            color: "var(--muted-foreground)",
            textAlign: "center",
          }}
        >
          Showing {data.transactions.length} of {data.totalCount}
        </div>
      )}
    </div>
  );
}

function Root() {
  const [data, setData] = useState<TableData | null>(null);

  if (!data) {
    initApp((d) => setData(d as TableData));
    return <div style={{ padding: "16px", color: "var(--muted-foreground)" }}>Loading...</div>;
  }

  return <TransactionTable data={data} />;
}

createRoot(document.getElementById("root")!).render(<Root />);
```

- [ ] **Step 2: Build and verify**

```bash
pnpm build:mcp-widgets
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/mcp/apps/src/transaction-table.tsx
git commit -m "feat: add transaction table MCP App widget"
```

---

### Task 28: Widget — Budget Progress

**Files:**
- Create: `src/lib/mcp/apps/src/budget-progress.tsx`

- [ ] **Step 1: Create budget progress widget**

Create `src/lib/mcp/apps/src/budget-progress.tsx`:

```typescript
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { initApp } from "./app-init";

interface BudgetCategory {
  name: string;
  allocatedCents: number;
  spentCents: number;
  allocatedDisplay: string;
  spentDisplay: string;
  percentUsed: number;
}

interface BudgetData {
  month: string;
  categories: BudgetCategory[];
  totalAllocatedDisplay: string;
  totalSpentDisplay: string;
  daysRemaining: number;
}

function getBarColor(percent: number): string {
  if (percent > 100) return "oklch(0.577 0.245 27.325)"; // destructive red
  if (percent > 80) return "oklch(0.75 0.18 85)"; // amber
  return "oklch(0.6 0.15 145)"; // green
}

function BudgetProgress({ data }: { data: BudgetData }) {
  const totalPercent =
    data.categories.reduce((s, c) => s + c.spentCents, 0) /
    Math.max(data.categories.reduce((s, c) => s + c.allocatedCents, 0), 1) *
    100;

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ marginBottom: "16px" }}>
        <div style={{ fontSize: "14px", color: "var(--muted-foreground)" }}>
          {data.month} &middot; {data.daysRemaining} days left
        </div>
        <div style={{ fontSize: "20px", fontWeight: 600 }}>
          {data.totalSpentDisplay}{" "}
          <span style={{ fontSize: "14px", fontWeight: 400, color: "var(--muted-foreground)" }}>
            of {data.totalAllocatedDisplay} ({Math.round(totalPercent)}%)
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {data.categories.map((cat) => (
          <div key={cat.name}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "13px",
                marginBottom: "4px",
              }}
            >
              <span>{cat.name}</span>
              <span style={{ color: "var(--muted-foreground)" }}>
                {cat.spentDisplay} / {cat.allocatedDisplay}
              </span>
            </div>
            <div
              style={{
                height: "8px",
                borderRadius: "4px",
                background: "var(--muted)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.min(cat.percentUsed, 100)}%`,
                  borderRadius: "4px",
                  background: getBarColor(cat.percentUsed),
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Root() {
  const [data, setData] = useState<BudgetData | null>(null);

  if (!data) {
    initApp((d) => setData(d as BudgetData));
    return <div style={{ padding: "16px", color: "var(--muted-foreground)" }}>Loading...</div>;
  }

  return <BudgetProgress data={data} />;
}

createRoot(document.getElementById("root")!).render(<Root />);
```

- [ ] **Step 2: Build and verify**

```bash
pnpm build:mcp-widgets
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/mcp/apps/src/budget-progress.tsx
git commit -m "feat: add budget progress MCP App widget"
```

---

### Task 29: Widget — Net Worth Trend

**Files:**
- Create: `src/lib/mcp/apps/src/net-worth-trend.tsx`

- [ ] **Step 1: Create net worth trend widget**

Create `src/lib/mcp/apps/src/net-worth-trend.tsx`:

```typescript
import { createRoot } from "react-dom/client";
import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { initApp } from "./app-init";

interface DataPoint {
  date: string;
  assetsCents: number;
  liabilitiesCents: number;
  netWorthCents: number;
  assetsDisplay: string;
  liabilitiesDisplay: string;
  netWorthDisplay: string;
}

interface NetWorthData {
  points: DataPoint[];
  currentNetWorthDisplay: string;
  changeDisplay: string;
  changePercent: number;
}

function NetWorthTrend({ data }: { data: NetWorthData }) {
  const isPositiveChange = data.changePercent >= 0;

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ marginBottom: "16px" }}>
        <div style={{ fontSize: "14px", color: "var(--muted-foreground)" }}>
          Net Worth
        </div>
        <div style={{ fontSize: "24px", fontWeight: 600 }}>
          {data.currentNetWorthDisplay}
        </div>
        <div
          style={{
            fontSize: "13px",
            color: isPositiveChange ? "oklch(0.6 0.15 145)" : "oklch(0.577 0.245 27.325)",
          }}
        >
          {isPositiveChange ? "+" : ""}{data.changeDisplay} ({isPositiveChange ? "+" : ""}
          {data.changePercent.toFixed(1)}%)
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data.points}>
          <defs>
            <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tickFormatter={(d: string) => {
              const [, m] = d.split("-");
              const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
              return months[parseInt(m)] ?? d;
            }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `$${(v / 100000).toFixed(0)}k`}
            width={50}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              fontSize: "12px",
            }}
            formatter={(_, name, props) => {
              const p = props.payload as DataPoint;
              return [p.netWorthDisplay, "Net Worth"];
            }}
            labelFormatter={(label: string) => label}
          />
          <Area
            type="monotone"
            dataKey="netWorthCents"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#netWorthGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Root() {
  const [data, setData] = useState<NetWorthData | null>(null);

  if (!data) {
    initApp((d) => setData(d as NetWorthData));
    return <div style={{ padding: "16px", color: "var(--muted-foreground)" }}>Loading...</div>;
  }

  return <NetWorthTrend data={data} />;
}

createRoot(document.getElementById("root")!).render(<Root />);
```

- [ ] **Step 2: Build all widgets and verify sizes**

```bash
pnpm build:mcp-widgets
ls -lh src/lib/mcp/apps/widgets/
```

Expected: 4 HTML files, each under 200KB uncompressed.

- [ ] **Step 3: Commit**

```bash
git add src/lib/mcp/apps/src/net-worth-trend.tsx
git commit -m "feat: add net worth trend MCP App widget"
```

---

### Task 30: Register App Tools + show_financial_dashboard

**Files:**
- Create: `src/lib/mcp/apps/register.ts`
- Modify: `src/lib/mcp/tools/index.ts`

- [ ] **Step 1: Install ext-apps dependency**

```bash
pnpm add @modelcontextprotocol/ext-apps
```

- [ ] **Step 2: Create the app registration module**

Create `src/lib/mcp/apps/register.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync } from "fs";
import { resolve } from "path";
import { getDashboardSummary, getNetWorthHistory, getMonthlySpending, getCashFlow } from "@/queries/dashboard";
import { getSpendingByCategory } from "@/queries/reports";
import { getBudgetForMonth } from "@/queries/budgets";
import { getTransactions } from "@/queries/transactions";
import { centsToDisplay } from "@/lib/money";
import { getCurrentMonth, monthBounds, todayDateString } from "@/lib/date-utils";

const WIDGET_DIR = resolve(
  process.cwd(),
  "src/lib/mcp/apps/widgets",
);

const VIEWS = ["spending-breakdown", "transaction-table", "budget-progress", "net-worth-trend"] as const;

function readWidget(name: string): string {
  return readFileSync(resolve(WIDGET_DIR, `${name}.html`), "utf-8");
}

export function registerAppTools(server: McpServer, householdId: string) {
  // Register widget HTML as MCP resources
  for (const view of VIEWS) {
    server.resource(
      `widget-${view}`,
      `ui://ledgr/${view}`,
      { mimeType: "text/html" },
      async () => ({
        contents: [
          {
            uri: `ui://ledgr/${view}`,
            mimeType: "text/html",
            text: readWidget(view),
          },
        ],
      }),
    );
  }

  server.registerTool(
    "show_financial_dashboard",
    {
      title: "Financial Dashboard",
      description:
        "Show an interactive financial widget in the chat. " +
        "Views: spending-breakdown (donut chart), transaction-table (sortable list), " +
        "budget-progress (category bars), net-worth-trend (area chart).",
      inputSchema: {
        view: z.enum(VIEWS).describe("Which widget to display"),
        dateFrom: z.string().optional().describe("Start date for data (YYYY-MM-DD)"),
        dateTo: z.string().optional().describe("End date for data (YYYY-MM-DD)"),
        month: z.string().optional().describe("Month for budget view (YYYY-MM)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async ({ view, dateFrom, dateTo, month }) => {
      let widgetData: unknown;
      let textSummary: string;

      switch (view) {
        case "spending-breakdown": {
          const m = month ?? getCurrentMonth();
          const bounds = monthBounds(m);
          const from = dateFrom ?? bounds.from;
          const to = dateTo ?? bounds.to;
          const rows = getSpendingByCategory(householdId, { dateFrom: from, dateTo: to });
          const total = rows.reduce((s, r) => s + r.total, 0);

          widgetData = {
            categories: rows.map((r, i) => ({
              name: r.categoryName,
              amountCents: r.total,
              amountDisplay: centsToDisplay(r.total),
              percentage: total > 0 ? Math.round((r.total / total) * 100) : 0,
              color: `var(--chart-${(i % 5) + 1})`,
            })),
            period: m,
            totalDisplay: centsToDisplay(total),
          };
          textSummary = `Spending breakdown for ${m}: ${centsToDisplay(total)} total across ${rows.length} categories.`;
          break;
        }

        case "transaction-table": {
          const page = getTransactions(
            householdId,
            { dateFrom, dateTo },
            50,
            null,
          );
          widgetData = {
            transactions: page.rows.map((t) => ({
              date: t.date,
              name: t.name,
              merchant: t.merchantName,
              category: t.categoryName,
              amountCents: t.normalizedAmount,
              amountDisplay: centsToDisplay(t.normalizedAmount, t.currency),
              isIncome: t.normalizedAmount > 0,
            })),
            totalCount: page.rows.length,
            page: 1,
          };
          textSummary = `Showing ${page.rows.length} transactions.`;
          break;
        }

        case "budget-progress": {
          const m = month ?? getCurrentMonth();
          const budget = getBudgetForMonth(householdId, m);
          const now = new Date();
          const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
          const daysRemaining = daysInMonth - now.getDate();

          widgetData = {
            month: m,
            categories: budget.groups.flatMap((g) =>
              g.categories.map((c) => ({
                name: c.categoryName,
                allocatedCents: c.limitAmount,
                spentCents: c.spent,
                allocatedDisplay: centsToDisplay(c.limitAmount),
                spentDisplay: centsToDisplay(c.spent),
                percentUsed: c.limitAmount > 0 ? Math.round((c.spent / c.limitAmount) * 100) : 0,
              })),
            ),
            totalAllocatedDisplay: centsToDisplay(budget.summary.totalBudgeted),
            totalSpentDisplay: centsToDisplay(budget.summary.totalSpent),
            daysRemaining,
          };
          textSummary = `Budget for ${m}: ${centsToDisplay(budget.summary.totalSpent)} spent of ${centsToDisplay(budget.summary.totalBudgeted)} allocated, ${daysRemaining} days remaining.`;
          break;
        }

        case "net-worth-trend": {
          const points = getNetWorthHistory(householdId, "6M");
          const current = points[points.length - 1];
          const first = points[0];
          const change = current ? current.netWorth - (first?.netWorth ?? 0) : 0;
          const changePercent = first?.netWorth ? (change / Math.abs(first.netWorth)) * 100 : 0;

          widgetData = {
            points: points.map((p) => ({
              date: p.date,
              assetsCents: p.assets,
              liabilitiesCents: p.liabilities,
              netWorthCents: p.netWorth,
              assetsDisplay: centsToDisplay(p.assets),
              liabilitiesDisplay: centsToDisplay(p.liabilities),
              netWorthDisplay: centsToDisplay(p.netWorth),
            })),
            currentNetWorthDisplay: current ? centsToDisplay(current.netWorth) : "$0.00",
            changeDisplay: centsToDisplay(change),
            changePercent,
          };
          textSummary = `Net worth trend (6 months): currently ${current ? centsToDisplay(current.netWorth) : "$0.00"}, change ${centsToDisplay(change)} (${changePercent.toFixed(1)}%).`;
          break;
        }
      }

      return {
        content: [{ type: "text" as const, text: textSummary }],
        structuredContent: { data: widgetData },
        _meta: {
          ui: {
            resourceUri: `ui://ledgr/${view}`,
          },
        },
      };
    },
  );
}
```

- [ ] **Step 3: Wire app tools into index.ts**

Add to `src/lib/mcp/tools/index.ts`:

```typescript
import { registerAppTools } from "../apps/register";

// Inside if (scopes.includes("ledgr:read")):
    registerAppTools(server, householdId);
```

- [ ] **Step 4: Type check**

```bash
pnpm typecheck
```

- [ ] **Step 5: Build widgets**

```bash
pnpm build:mcp-widgets
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/mcp/apps/register.ts src/lib/mcp/tools/index.ts pnpm-lock.yaml package.json
git commit -m "feat: add show_financial_dashboard MCP app tool with 4 interactive widgets"
```

---

### Task 31: End-to-End Smoke Test

**Files:** None created — manual verification.

- [ ] **Step 1: Start the dev server with MCP enabled**

```bash
MCP_ENABLED=true LEDGR_URL=http://localhost:3000 pnpm dev
```

- [ ] **Step 2: Test discovery endpoints**

```bash
curl -s http://localhost:3000/.well-known/oauth-protected-resource | jq .
curl -s http://localhost:3000/.well-known/oauth-authorization-server | jq .
```

Expected: Both return valid JSON with correct URLs and scopes.

- [ ] **Step 3: Test client registration**

```bash
curl -s -X POST http://localhost:3000/api/mcp/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"client_name":"Smoke Test","redirect_uris":["http://localhost:9999/callback"]}' | jq .
```

Expected: `{"client_id":"...","client_name":"Smoke Test"}`

- [ ] **Step 4: Test MCP endpoint without auth**

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

Expected: 401 with `WWW-Authenticate: Bearer realm="ledgr"` header.

- [ ] **Step 5: Verify all tests pass**

```bash
pnpm test
pnpm typecheck
pnpm lint
```

Expected: All pass.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: verify MCP integration end-to-end smoke test passes"
```
