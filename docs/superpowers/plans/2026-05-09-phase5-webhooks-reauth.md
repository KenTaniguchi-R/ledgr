# Phase 5 — Webhooks + Re-auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Plaid webhook handling for event-driven transaction syncing and implement the re-authentication flow for disconnected bank connections.

**Architecture:** Layered backend — extracted webhook verification (`webhook-verify.ts`), handler map dispatch (`webhook-handlers.ts`), and thin API route. Extended frontend — `PlaidLinkFlow` gains update mode, `InstitutionHeader` gains "Reconnect" button. No new UI components.

**Tech Stack:** Next.js 16, Drizzle ORM, SQLite, jose (JWT), Zod, MSW, Vitest, shadcn/ui v4, react-plaid-link

**Design Spec:** `docs/superpowers/specs/2026-05-09-phase5-webhooks-reauth-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/lib/plaid/webhook-verify.ts` | JWK/JWT signature verification with cache, replay protection |
| `src/lib/plaid/webhook-verify.test.ts` | Unit tests for verification (crypto, replay, rotation) |
| `src/lib/plaid/webhook-handlers.ts` | Handler map + `dispatchWebhook` dispatch function |
| `src/app/api/plaid/webhook/route.ts` | Thin POST route — verify then dispatch |
| `src/actions/reauth.ts` | `createUpdateLinkToken` + `completeReAuth` server actions |
| `src/db/seed/backfill-plaid-item-id.ts` | One-shot script to backfill plaid_item_id for existing items |
| `tests/integration/webhook-handler.test.ts` | Dispatch integration tests |
| `tests/integration/reauth.test.ts` | Re-auth server action integration tests |

### Modified Files
| File | Change |
|------|--------|
| `src/db/schema/plaid.ts` | Add `plaidItemId` column, unique index, `"revoked"` status |
| `src/actions/plaid.ts` | Store `plaid_item_id` during token exchange |
| `src/lib/plaid/sync.ts` | Export `REAUTH_ERROR_CODES` and `TRANSIENT_ERROR_CODES` |
| `src/lib/plaid/schemas.ts` | Add `WebhookPayloadSchema` |
| `src/middleware.ts` | Add `/api/plaid/webhook` to `publicPaths` |
| `tests/mocks/handlers.ts` | Add `webhookVerificationKeyGet` and `itemGet` MSW handlers |
| `src/components/organisms/plaid-link-flow.tsx` | Add `mode`, `plaidItemId`, `reconnect-inline` variant, fix `open()` bug |
| `src/components/molecules/institution-header.tsx` | Add `"use client"`, render `PlaidLinkFlow` for re-auth |
| `src/components/organisms/account-list.tsx` | Add `reAuthingItemId` state, pass re-auth callbacks |
| `src/queries/accounts.ts` | Add `"revoked"` to `InstitutionGroup.status` type |

---

## Task 1: Schema Migration — Add `plaidItemId` Column

**Files:**
- Modify: `src/db/schema/plaid.ts`
- Modify: `src/queries/accounts.ts:26`

- [ ] **Step 1: Add `plaidItemId` column and `"revoked"` status to schema**

In `src/db/schema/plaid.ts`, add the `plaidItemId` column and update the status enum:

```ts
export const plaidItems = sqliteTable("plaid_items", {
  id: text("id").primaryKey(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  plaidInstitutionId: text("plaid_institution_id"),
  plaidItemId: text("plaid_item_id"),
  institutionName: text("institution_name"),
  syncCursor: text("sync_cursor"),
  status: text("status", {
    enum: ["active", "error", "reauth_required", "revoked"],
  }).default("active"),
  errorCode: text("error_code"),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
}, (table) => [
  index("idx_plaid_items_household").on(table.householdId),
  index("idx_plaid_items_household_institution").on(table.householdId, table.plaidInstitutionId),
  uniqueIndex("idx_plaid_items_plaid_item_id").on(table.plaidItemId),
]);
```

Add the `uniqueIndex` import:
```ts
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
```

- [ ] **Step 2: Update `InstitutionGroup.status` type in queries**

In `src/queries/accounts.ts`, update the status union at line 26:

```ts
export interface InstitutionGroup {
  institutionName: string;
  plaidItemId: string | null;
  status: "active" | "error" | "reauth_required" | "revoked" | null;
  lastSyncedAt: string | null;
  accounts: AccountRow[];
}
```

- [ ] **Step 3: Generate and run migration**

Run:
```bash
pnpm db:generate && pnpm db:migrate
```

Expected: Migration creates `plaid_item_id` column and unique index. No errors.

- [ ] **Step 4: Verify typecheck passes**

Run:
```bash
pnpm typecheck
```

Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/plaid.ts src/queries/accounts.ts src/db/migrations/
git commit -m "feat: add plaid_item_id column and revoked status to plaid_items schema"
```

---

## Task 2: Store `plaid_item_id` During Token Exchange

**Files:**
- Modify: `src/actions/plaid.ts:97-107`

- [ ] **Step 1: Add `plaidItemId` to the plaidItems insert**

In `src/actions/plaid.ts`, in the `exchangeAndStoreAccounts` function, update the `tx.insert(plaidItems).values(...)` call (around line 98) to include the Plaid item ID from `itemRes`:

```ts
      tx.insert(plaidItems)
        .values({
          id: plaidItemId,
          householdId,
          accessToken: encrypt(accessToken),
          plaidInstitutionId: institutionId,
          plaidItemId: itemRes.data.item.item_id,
          institutionName,
          status: "active",
        })
        .run();
```

Note: The local variable `plaidItemId` (line 94) is the internal UUID. The new field `plaidItemId` in the schema stores Plaid's own item ID string (e.g., `"item_abc123"`). The column name in the DB is `plaid_item_id`, which matches the schema field. Drizzle handles the mapping.

- [ ] **Step 2: Verify existing tests still pass**

Run:
```bash
pnpm test -- --run
```

Expected: All tests pass. The MSW `item/get` handler already returns `item_id: "plaid-item-1"`.

- [ ] **Step 3: Commit**

```bash
git add src/actions/plaid.ts
git commit -m "feat: store plaid_item_id from Plaid API during token exchange"
```

---

## Task 3: Export Error Code Sets from Sync Engine

**Files:**
- Modify: `src/lib/plaid/sync.ts:77-94`

- [ ] **Step 1: Add `export` keyword to both error code sets**

In `src/lib/plaid/sync.ts`, change lines 77 and 87 from `const` to `export const`:

```ts
export const REAUTH_ERROR_CODES = new Set([
  "ITEM_LOGIN_REQUIRED",
  "INVALID_CREDENTIALS",
  "INVALID_MFA",
  "ITEM_LOCKED",
  "USER_SETUP_REQUIRED",
  "MFA_NOT_SUPPORTED",
  "INSUFFICIENT_CREDENTIALS",
]);

export const TRANSIENT_ERROR_CODES = new Set([
  "INSTITUTION_DOWN",
  "INSTITUTION_NOT_RESPONDING",
  "INSTITUTION_NOT_AVAILABLE",
  "TRANSACTIONS_LIMIT",
  "RATE_LIMIT_EXCEEDED",
  "INTERNAL_SERVER_ERROR",
]);
```

- [ ] **Step 2: Verify no regressions**

Run:
```bash
pnpm typecheck && pnpm test -- --run
```

Expected: All pass. Adding `export` to existing constants has no side effects.

- [ ] **Step 3: Commit**

```bash
git add src/lib/plaid/sync.ts
git commit -m "refactor: export REAUTH_ERROR_CODES and TRANSIENT_ERROR_CODES from sync engine"
```

---

## Task 4: Add `WebhookPayloadSchema` to Schemas

**Files:**
- Modify: `src/lib/plaid/schemas.ts`

- [ ] **Step 1: Add the Zod schema and type**

Append to `src/lib/plaid/schemas.ts`:

```ts
export const WebhookPayloadSchema = z.object({
  webhook_type: z.string(),
  webhook_code: z.string(),
  item_id: z.string(),
  error: z
    .object({
      error_type: z.string(),
      error_code: z.string(),
      error_message: z.string(),
    })
    .nullable()
    .optional(),
});

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;
```

- [ ] **Step 2: Verify typecheck**

Run:
```bash
pnpm typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/plaid/schemas.ts
git commit -m "feat: add WebhookPayloadSchema for Plaid webhook payloads"
```

---

## Task 5: Webhook Signature Verification

**Files:**
- Create: `src/lib/plaid/webhook-verify.ts`
- Create: `src/lib/plaid/webhook-verify.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/plaid/webhook-verify.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { createHash } from "node:crypto";
import { http, HttpResponse } from "msw";
import { server } from "../../../tests/mocks/server";
import { resetPlaidClient } from "./client";

// Will import after implementation exists
// import { verifyWebhookSignature, WebhookVerificationError, clearJwkCache } from "./webhook-verify";

const TEST_BODY = JSON.stringify({
  webhook_type: "TRANSACTIONS",
  webhook_code: "SYNC_UPDATES_AVAILABLE",
  item_id: "test-item-123",
});

const bodyHash = createHash("sha256").update(TEST_BODY).digest("hex");

let privateKey: CryptoKey;
let publicJwk: Record<string, unknown>;
const TEST_KID = "test-key-id-1";

beforeAll(async () => {
  vi.stubEnv("PLAID_CLIENT_ID", "test-id");
  vi.stubEnv("PLAID_SECRET", "test-secret");
  vi.stubEnv("PLAID_ENV", "sandbox");

  const keyPair = await generateKeyPair("ES256");
  privateKey = keyPair.privateKey;
  const jwk = await exportJWK(keyPair.publicKey);
  publicJwk = {
    ...jwk,
    kid: TEST_KID,
    alg: "ES256",
    use: "sig",
    created_at: Math.floor(Date.now() / 1000) - 60,
    expired_at: null,
  };

  server.listen({ onUnhandledRequest: "error" });
});

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

afterEach(() => {
  server.resetHandlers();
  resetPlaidClient();
});

async function createTestJwt(body: string, opts?: { iat?: number }): Promise<string> {
  const hash = createHash("sha256").update(body).digest("hex");
  const iat = opts?.iat ?? Math.floor(Date.now() / 1000);
  return new SignJWT({ request_body_sha256: hash, iat })
    .setProtectedHeader({ alg: "ES256", kid: TEST_KID, typ: "JWT" })
    .setIssuedAt(iat)
    .sign(privateKey);
}

function mockWebhookKeyEndpoint() {
  server.use(
    http.post("https://sandbox.plaid.com/webhook_verification_key/get", () =>
      HttpResponse.json({ key: publicJwk, request_id: "req-key-1" })
    )
  );
}

describe("verifyWebhookSignature", () => {
  it("returns parsed payload for valid signature and body hash", async () => {
    const { verifyWebhookSignature, clearJwkCache } = await import("./webhook-verify");
    clearJwkCache();
    mockWebhookKeyEndpoint();

    const jwt = await createTestJwt(TEST_BODY);
    const result = await verifyWebhookSignature(TEST_BODY, jwt);

    expect(result).toEqual({
      webhook_type: "TRANSACTIONS",
      webhook_code: "SYNC_UPDATES_AVAILABLE",
      item_id: "test-item-123",
    });
  });

  it("throws WebhookVerificationError on tampered body", async () => {
    const { verifyWebhookSignature, WebhookVerificationError, clearJwkCache } = await import("./webhook-verify");
    clearJwkCache();
    mockWebhookKeyEndpoint();

    const jwt = await createTestJwt(TEST_BODY);
    const tamperedBody = JSON.stringify({ webhook_type: "EVIL", webhook_code: "HACK", item_id: "x" });

    await expect(verifyWebhookSignature(tamperedBody, jwt)).rejects.toThrow(WebhookVerificationError);
  });

  it("throws on stale iat (replay protection)", async () => {
    const { verifyWebhookSignature, WebhookVerificationError, clearJwkCache } = await import("./webhook-verify");
    clearJwkCache();
    mockWebhookKeyEndpoint();

    const staleIat = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const jwt = await createTestJwt(TEST_BODY, { iat: staleIat });

    await expect(verifyWebhookSignature(TEST_BODY, jwt)).rejects.toThrow(WebhookVerificationError);
  });

  it("throws on invalid JWT signature", async () => {
    const { verifyWebhookSignature, WebhookVerificationError, clearJwkCache } = await import("./webhook-verify");
    clearJwkCache();
    mockWebhookKeyEndpoint();

    await expect(verifyWebhookSignature(TEST_BODY, "invalid.jwt.token")).rejects.toThrow(WebhookVerificationError);
  });

  it("retries with fresh key on verification failure (key rotation)", async () => {
    const { verifyWebhookSignature, clearJwkCache } = await import("./webhook-verify");
    clearJwkCache();

    // First call: return an old key. Second call: return the correct key.
    const oldKeyPair = await generateKeyPair("ES256");
    const oldJwk = await exportJWK(oldKeyPair.publicKey);
    let callCount = 0;

    server.use(
      http.post("https://sandbox.plaid.com/webhook_verification_key/get", () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json({
            key: { ...oldJwk, kid: TEST_KID, alg: "ES256", use: "sig", created_at: 1, expired_at: null },
            request_id: "req-old",
          });
        }
        return HttpResponse.json({ key: publicJwk, request_id: "req-new" });
      })
    );

    const jwt = await createTestJwt(TEST_BODY);
    const result = await verifyWebhookSignature(TEST_BODY, jwt);

    expect(result.item_id).toBe("test-item-123");
    expect(callCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
pnpm test -- --run src/lib/plaid/webhook-verify.test.ts
```

Expected: FAIL — `./webhook-verify` module does not exist.

- [ ] **Step 3: Implement `webhook-verify.ts`**

Create `src/lib/plaid/webhook-verify.ts`:

```ts
import { jwtVerify, importJWK, decodeProtectedHeader, type JWTPayload } from "jose";
import { createHash } from "node:crypto";
import { getPlaidClient } from "./client";
import { WebhookPayloadSchema, type WebhookPayload } from "./schemas";

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

interface CachedKey {
  key: CryptoKey;
  expiresAt: number;
}

const MAX_CACHE_SIZE = 10;
const TTL_MS = 5 * 60 * 1000;

const jwkCache = new Map<string, CachedKey>();
const inflight = new Map<string, Promise<CryptoKey>>();

export function clearJwkCache() {
  jwkCache.clear();
  inflight.clear();
}

async function fetchJwk(kid: string): Promise<CryptoKey> {
  const pending = inflight.get(kid);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const client = getPlaidClient();
      const res = await client.webhookVerificationKeyGet({ key_id: kid });
      const jwk = res.data.key;
      const cryptoKey = await importJWK(
        { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
        jwk.alg,
      );

      if (jwkCache.size >= MAX_CACHE_SIZE) {
        const oldest = jwkCache.keys().next().value!;
        jwkCache.delete(oldest);
      }

      jwkCache.set(kid, { key: cryptoKey as CryptoKey, expiresAt: Date.now() + TTL_MS });
      return cryptoKey as CryptoKey;
    } finally {
      inflight.delete(kid);
    }
  })();

  inflight.set(kid, promise);
  return promise;
}

async function getKey(kid: string): Promise<CryptoKey> {
  const cached = jwkCache.get(kid);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.key;
  }
  jwkCache.delete(kid);
  return fetchJwk(kid);
}

async function verify(rawBody: string, token: string): Promise<WebhookPayload> {
  const header = decodeProtectedHeader(token);
  if (!header.kid) {
    throw new WebhookVerificationError("JWT missing kid header");
  }

  const key = await getKey(header.kid);
  const { payload } = await jwtVerify(token, key);

  const iat = (payload as JWTPayload).iat;
  if (!iat || Math.floor(Date.now() / 1000) - iat > 300) {
    throw new WebhookVerificationError("JWT iat is stale (replay protection)");
  }

  const expectedHash = (payload as Record<string, unknown>).request_body_sha256;
  const actualHash = createHash("sha256").update(rawBody).digest("hex");
  if (expectedHash !== actualHash) {
    throw new WebhookVerificationError("Body hash mismatch");
  }

  const body = JSON.parse(rawBody);
  return WebhookPayloadSchema.parse(body);
}

export async function verifyWebhookSignature(
  rawBody: string,
  plaidVerificationHeader: string,
): Promise<WebhookPayload> {
  try {
    return await verify(rawBody, plaidVerificationHeader);
  } catch (err) {
    if (err instanceof WebhookVerificationError) throw err;

    // Retry once with fresh key (handles key rotation)
    try {
      const header = decodeProtectedHeader(plaidVerificationHeader);
      if (header.kid) {
        jwkCache.delete(header.kid);
      }
      return await verify(rawBody, plaidVerificationHeader);
    } catch {
      throw new WebhookVerificationError(
        `Webhook verification failed: ${err instanceof Error ? err.message : "unknown error"}`
      );
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
pnpm test -- --run src/lib/plaid/webhook-verify.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plaid/webhook-verify.ts src/lib/plaid/webhook-verify.test.ts
git commit -m "feat: add webhook signature verification with JWK cache and replay protection"
```

---

## Task 6: Webhook Dispatch Handlers

**Files:**
- Create: `src/lib/plaid/webhook-handlers.ts`
- Create: `tests/integration/webhook-handler.test.ts`
- Modify: `tests/mocks/handlers.ts`

- [ ] **Step 1: Add MSW handler for `webhookVerificationKeyGet`**

In `tests/mocks/handlers.ts`, add before the `allHandlers` export:

```ts
export const webhookKeyHandler = http.post(
  "https://sandbox.plaid.com/webhook_verification_key/get",
  () =>
    HttpResponse.json({
      key: {
        alg: "ES256",
        crv: "P-256",
        kid: "test-key-1",
        kty: "EC",
        use: "sig",
        x: "mock-x-coordinate",
        y: "mock-y-coordinate",
        created_at: 1700000000,
        expired_at: null,
      },
      request_id: "req-key-test",
    })
);
```

Update `allHandlers`:
```ts
export const allHandlers = [...plaidHandlers, webhookKeyHandler];
```

- [ ] **Step 2: Write the failing integration tests**

Create `tests/integration/webhook-handler.test.ts`:

```ts
import { describe, it, expect, afterEach, beforeAll, afterAll, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { v4 as uuid } from "uuid";
import { createTestDb } from "./setup";
import { server } from "../mocks/server";
import { encrypt } from "@/lib/encryption";
import { resetPlaidClient } from "@/lib/plaid/client";
import { households, householdMembers, plaidItems, accounts, syncLog } from "@/db/schema";

const HOUSEHOLD_ID = "hh-webhook-test";
const INTERNAL_ITEM_ID = "internal-item-webhook";
const PLAID_ITEM_ID_VALUE = "plaid-item-wh-123";

beforeAll(() => {
  vi.stubEnv("PLAID_CLIENT_ID", "test-id");
  vi.stubEnv("PLAID_SECRET", "test-secret");
  vi.stubEnv("PLAID_ENV", "sandbox");
  vi.stubEnv("ENCRYPTION_KEY", "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2");
  server.listen({ onUnhandledRequest: "error" });
});

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

describe("dispatchWebhook", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let close: () => void;

  beforeEach(() => {
    resetPlaidClient();
  });

  afterEach(() => {
    server.resetHandlers();
    close?.();
  });

  function setup() {
    const result = createTestDb();
    db = result.db;
    close = result.close;
    return db;
  }

  function seedTestData(testDb: typeof db) {
    const now = new Date().toISOString();
    testDb.insert(households).values({ id: HOUSEHOLD_ID, name: "Test", createdAt: now, updatedAt: now }).run();
    testDb.insert(householdMembers).values({ id: uuid(), householdId: HOUSEHOLD_ID, userId: "user-1", role: "owner", createdAt: now }).run();
    testDb.insert(plaidItems).values({
      id: INTERNAL_ITEM_ID,
      householdId: HOUSEHOLD_ID,
      accessToken: encrypt("access-sandbox-test-token"),
      plaidItemId: PLAID_ITEM_ID_VALUE,
      institutionName: "Chase",
      status: "active",
      createdAt: now,
      updatedAt: now,
    }).run();
    testDb.insert(accounts).values({
      id: "acc-wh-checking",
      householdId: HOUSEHOLD_ID,
      plaidItemId: INTERNAL_ITEM_ID,
      plaidAccountId: "plaid-acc-checking",
      name: "Checking",
      type: "checking",
      createdAt: now,
      updatedAt: now,
    }).run();
  }

  it("SYNC_UPDATES_AVAILABLE triggers syncInstitution", async () => {
    const { dispatchWebhook } = await import("@/lib/plaid/webhook-handlers");
    const testDb = setup();
    seedTestData(testDb);

    server.use(
      http.post("https://sandbox.plaid.com/transactions/sync", () =>
        HttpResponse.json({ added: [], modified: [], removed: [], has_more: false, next_cursor: "cursor_wh", request_id: "req-wh" })
      )
    );

    await dispatchWebhook({ webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE", item_id: PLAID_ITEM_ID_VALUE }, testDb);

    const logs = testDb.select().from(syncLog).where(eq(syncLog.plaidItemId, INTERNAL_ITEM_ID)).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].cursorAfter).toBe("cursor_wh");
  });

  it("ITEM:ERROR with ITEM_LOGIN_REQUIRED sets reauth_required", async () => {
    const { dispatchWebhook } = await import("@/lib/plaid/webhook-handlers");
    const testDb = setup();
    seedTestData(testDb);

    await dispatchWebhook({
      webhook_type: "ITEM",
      webhook_code: "ERROR",
      item_id: PLAID_ITEM_ID_VALUE,
      error: { error_type: "ITEM_ERROR", error_code: "ITEM_LOGIN_REQUIRED", error_message: "login required" },
    }, testDb);

    const item = testDb.select().from(plaidItems).where(eq(plaidItems.id, INTERNAL_ITEM_ID)).get()!;
    expect(item.status).toBe("reauth_required");
    expect(item.errorCode).toBe("ITEM_LOGIN_REQUIRED");
  });

  it("ITEM:ERROR with INSTITUTION_DOWN sets error status", async () => {
    const { dispatchWebhook } = await import("@/lib/plaid/webhook-handlers");
    const testDb = setup();
    seedTestData(testDb);

    await dispatchWebhook({
      webhook_type: "ITEM",
      webhook_code: "ERROR",
      item_id: PLAID_ITEM_ID_VALUE,
      error: { error_type: "INSTITUTION_ERROR", error_code: "INSTITUTION_DOWN", error_message: "down" },
    }, testDb);

    const item = testDb.select().from(plaidItems).where(eq(plaidItems.id, INTERNAL_ITEM_ID)).get()!;
    expect(item.status).toBe("error");
    expect(item.errorCode).toBe("INSTITUTION_DOWN");
  });

  it("ITEM:ERROR with missing error field is a no-op", async () => {
    const { dispatchWebhook } = await import("@/lib/plaid/webhook-handlers");
    const testDb = setup();
    seedTestData(testDb);

    await dispatchWebhook({
      webhook_type: "ITEM",
      webhook_code: "ERROR",
      item_id: PLAID_ITEM_ID_VALUE,
    }, testDb);

    const item = testDb.select().from(plaidItems).where(eq(plaidItems.id, INTERNAL_ITEM_ID)).get()!;
    expect(item.status).toBe("active");
  });

  it("ITEM:PENDING_EXPIRATION sets reauth_required", async () => {
    const { dispatchWebhook } = await import("@/lib/plaid/webhook-handlers");
    const testDb = setup();
    seedTestData(testDb);

    await dispatchWebhook({
      webhook_type: "ITEM",
      webhook_code: "PENDING_EXPIRATION",
      item_id: PLAID_ITEM_ID_VALUE,
    }, testDb);

    const item = testDb.select().from(plaidItems).where(eq(plaidItems.id, INTERNAL_ITEM_ID)).get()!;
    expect(item.status).toBe("reauth_required");
  });

  it("ITEM:USER_PERMISSION_REVOKED sets revoked status", async () => {
    const { dispatchWebhook } = await import("@/lib/plaid/webhook-handlers");
    const testDb = setup();
    seedTestData(testDb);

    await dispatchWebhook({
      webhook_type: "ITEM",
      webhook_code: "USER_PERMISSION_REVOKED",
      item_id: PLAID_ITEM_ID_VALUE,
    }, testDb);

    const item = testDb.select().from(plaidItems).where(eq(plaidItems.id, INTERNAL_ITEM_ID)).get()!;
    expect(item.status).toBe("revoked");
  });

  it("unknown webhook type is a no-op", async () => {
    const { dispatchWebhook } = await import("@/lib/plaid/webhook-handlers");
    const testDb = setup();
    seedTestData(testDb);

    await dispatchWebhook({
      webhook_type: "UNKNOWN",
      webhook_code: "SOMETHING",
      item_id: PLAID_ITEM_ID_VALUE,
    }, testDb);

    const item = testDb.select().from(plaidItems).where(eq(plaidItems.id, INTERNAL_ITEM_ID)).get()!;
    expect(item.status).toBe("active");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:
```bash
pnpm test -- --run tests/integration/webhook-handler.test.ts
```

Expected: FAIL — `@/lib/plaid/webhook-handlers` does not exist.

- [ ] **Step 4: Implement `webhook-handlers.ts`**

Create `src/lib/plaid/webhook-handlers.ts`:

```ts
import { eq } from "drizzle-orm";
import { plaidItems } from "@/db/schema";
import { db as defaultDb, type LedgrDb } from "@/db";
import { syncInstitution } from "./sync";
import { REAUTH_ERROR_CODES, TRANSIENT_ERROR_CODES } from "./sync";
import type { WebhookPayload } from "./schemas";

type WebhookContext = { db: LedgrDb; payload: WebhookPayload };
type WebhookHandler = (ctx: WebhookContext) => Promise<void>;

function findItemByPlaidId(db: LedgrDb, plaidItemIdValue: string) {
  return db
    .select({ id: plaidItems.id, householdId: plaidItems.householdId })
    .from(plaidItems)
    .where(eq(plaidItems.plaidItemId, plaidItemIdValue))
    .get();
}

function updateItemStatus(db: LedgrDb, itemId: string, status: string, errorCode: string | null) {
  db.update(plaidItems)
    .set({ status, errorCode, updatedAt: new Date().toISOString() })
    .where(eq(plaidItems.id, itemId))
    .run();
}

async function handleSyncUpdates({ db, payload }: WebhookContext): Promise<void> {
  const item = findItemByPlaidId(db, payload.item_id);
  if (!item) {
    console.warn(`[webhook] No plaid_items row for plaid_item_id=${payload.item_id}`);
    return;
  }
  await syncInstitution(item.id, item.householdId, db);
}

async function handleItemError({ db, payload }: WebhookContext): Promise<void> {
  if (!payload.error) {
    console.warn(`[webhook] ITEM:ERROR without error field for item_id=${payload.item_id}`);
    return;
  }

  const item = findItemByPlaidId(db, payload.item_id);
  if (!item) {
    console.warn(`[webhook] No plaid_items row for plaid_item_id=${payload.item_id}`);
    return;
  }

  const code = payload.error.error_code;
  if (REAUTH_ERROR_CODES.has(code)) {
    updateItemStatus(db, item.id, "reauth_required", code);
  } else if (TRANSIENT_ERROR_CODES.has(code)) {
    updateItemStatus(db, item.id, "error", code);
  } else {
    updateItemStatus(db, item.id, "error", code);
  }
}

async function handlePendingExpiration({ db, payload }: WebhookContext): Promise<void> {
  const item = findItemByPlaidId(db, payload.item_id);
  if (!item) {
    console.warn(`[webhook] No plaid_items row for plaid_item_id=${payload.item_id}`);
    return;
  }
  updateItemStatus(db, item.id, "reauth_required", null);
}

async function handlePermissionRevoked({ db, payload }: WebhookContext): Promise<void> {
  const item = findItemByPlaidId(db, payload.item_id);
  if (!item) {
    console.warn(`[webhook] No plaid_items row for plaid_item_id=${payload.item_id}`);
    return;
  }
  updateItemStatus(db, item.id, "revoked", null);
}

const WEBHOOK_HANDLERS: Record<string, WebhookHandler> = {
  "TRANSACTIONS:SYNC_UPDATES_AVAILABLE": handleSyncUpdates,
  "ITEM:ERROR": handleItemError,
  "ITEM:PENDING_EXPIRATION": handlePendingExpiration,
  "ITEM:USER_PERMISSION_REVOKED": handlePermissionRevoked,
};

export async function dispatchWebhook(
  payload: WebhookPayload,
  db: LedgrDb = defaultDb,
): Promise<void> {
  const key = `${payload.webhook_type}:${payload.webhook_code}`;
  const handler = WEBHOOK_HANDLERS[key];
  if (!handler) {
    console.log(`[webhook] Unhandled webhook: ${key}`);
    return;
  }
  await handler({ db, payload });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
pnpm test -- --run tests/integration/webhook-handler.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/plaid/webhook-handlers.ts tests/integration/webhook-handler.test.ts tests/mocks/handlers.ts
git commit -m "feat: add webhook dispatch handlers with integration tests"
```

---

## Task 7: Webhook API Route + Middleware

**Files:**
- Create: `src/app/api/plaid/webhook/route.ts`
- Modify: `src/middleware.ts`

- [ ] **Step 1: Add `/api/plaid/webhook` to middleware publicPaths**

In `src/middleware.ts`, update line 4:

```ts
const publicPaths = ["/login", "/signup", "/api/auth", "/api/health", "/api/plaid/oauth-return", "/api/plaid/webhook"];
```

- [ ] **Step 2: Create the webhook route**

Create `src/app/api/plaid/webhook/route.ts`:

```ts
import { NextResponse } from "next/server";
import { verifyWebhookSignature, WebhookVerificationError } from "@/lib/plaid/webhook-verify";
import { dispatchWebhook } from "@/lib/plaid/webhook-handlers";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verificationHeader = request.headers.get("Plaid-Verification");

  if (!verificationHeader) {
    return NextResponse.json({ status: "ok" });
  }

  try {
    const payload = await verifyWebhookSignature(rawBody, verificationHeader);
    await dispatchWebhook(payload);
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return NextResponse.json({ error: "Verification failed" }, { status: 400 });
    }
    return NextResponse.json({ status: "ok" });
  }
}
```

- [ ] **Step 3: Verify typecheck**

Run:
```bash
pnpm typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/plaid/webhook/route.ts src/middleware.ts
git commit -m "feat: add webhook API route with signature verification"
```

---

## Task 8: Re-auth Server Actions

**Files:**
- Create: `src/actions/reauth.ts`
- Create: `tests/integration/reauth.test.ts`

- [ ] **Step 1: Write the failing integration tests**

Create `tests/integration/reauth.test.ts`:

```ts
import { describe, it, expect, afterEach, beforeAll, afterAll, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { v4 as uuid } from "uuid";
import { createTestDb } from "./setup";
import { server } from "../mocks/server";
import { encrypt } from "@/lib/encryption";
import { resetPlaidClient } from "@/lib/plaid/client";
import { households, householdMembers, plaidItems, accounts, syncLog } from "@/db/schema";

const HOUSEHOLD_ID = "hh-reauth-test";
const USER_ID = "user-reauth-1";
const ITEM_ID = "item-reauth-1";

beforeAll(() => {
  vi.stubEnv("PLAID_CLIENT_ID", "test-id");
  vi.stubEnv("PLAID_SECRET", "test-secret");
  vi.stubEnv("PLAID_ENV", "sandbox");
  vi.stubEnv("ENCRYPTION_KEY", "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2");
  server.listen({ onUnhandledRequest: "error" });
});

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

describe("re-auth server actions", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let close: () => void;

  beforeEach(() => {
    resetPlaidClient();
  });

  afterEach(() => {
    server.resetHandlers();
    close?.();
  });

  function setup() {
    const result = createTestDb();
    db = result.db;
    close = result.close;
    return db;
  }

  function seedItem(testDb: typeof db, status: string = "reauth_required") {
    const now = new Date().toISOString();
    testDb.insert(households).values({ id: HOUSEHOLD_ID, name: "Test", createdAt: now, updatedAt: now }).run();
    testDb.insert(householdMembers).values({ id: uuid(), householdId: HOUSEHOLD_ID, userId: USER_ID, role: "owner", createdAt: now }).run();
    testDb.insert(plaidItems).values({
      id: ITEM_ID,
      householdId: HOUSEHOLD_ID,
      accessToken: encrypt("access-sandbox-reauth-token"),
      plaidItemId: "plaid-item-reauth-1",
      institutionName: "Chase",
      status,
      errorCode: status === "reauth_required" ? "ITEM_LOGIN_REQUIRED" : null,
      createdAt: now,
      updatedAt: now,
    }).run();
    testDb.insert(accounts).values({
      id: "acc-reauth-1",
      householdId: HOUSEHOLD_ID,
      plaidItemId: ITEM_ID,
      plaidAccountId: "plaid-acc-checking",
      name: "Checking",
      type: "checking",
      createdAt: now,
      updatedAt: now,
    }).run();
  }

  it("createUpdateLinkToken returns link token for owned reauth_required item", async () => {
    const { createUpdateLinkTokenDirect } = await import("@/actions/reauth");
    const testDb = setup();
    seedItem(testDb);

    server.use(
      http.post("https://sandbox.plaid.com/link/token/create", () =>
        HttpResponse.json({ link_token: "link-update-token-123", expiration: "2026-12-31T00:00:00Z", request_id: "req-update" })
      )
    );

    const result = await createUpdateLinkTokenDirect(ITEM_ID, HOUSEHOLD_ID, testDb);
    expect(result).toEqual({ linkToken: "link-update-token-123" });
  });

  it("createUpdateLinkToken rejects wrong household", async () => {
    const { createUpdateLinkTokenDirect } = await import("@/actions/reauth");
    const testDb = setup();
    seedItem(testDb);

    const result = await createUpdateLinkTokenDirect(ITEM_ID, "wrong-household", testDb);
    expect(result).toEqual({ error: "Institution not found" });
  });

  it("completeReAuth resets status and triggers sync", async () => {
    const { completeReAuthDirect } = await import("@/actions/reauth");
    const testDb = setup();
    seedItem(testDb);

    server.use(
      http.post("https://sandbox.plaid.com/item/get", () =>
        HttpResponse.json({
          item: { item_id: "plaid-item-reauth-1", institution_id: "ins_1", error: null },
          request_id: "req-item-get",
        })
      ),
      http.post("https://sandbox.plaid.com/transactions/sync", () =>
        HttpResponse.json({ added: [], modified: [], removed: [], has_more: false, next_cursor: "cursor_reauth", request_id: "req-sync-reauth" })
      )
    );

    const result = await completeReAuthDirect(ITEM_ID, HOUSEHOLD_ID, testDb);
    expect(result).toEqual({ success: true });

    const item = testDb.select().from(plaidItems).where(eq(plaidItems.id, ITEM_ID)).get()!;
    expect(item.status).toBe("active");
    expect(item.errorCode).toBeNull();

    const logs = testDb.select().from(syncLog).where(eq(syncLog.plaidItemId, ITEM_ID)).all();
    expect(logs).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
pnpm test -- --run tests/integration/reauth.test.ts
```

Expected: FAIL — `@/actions/reauth` does not exist.

- [ ] **Step 3: Implement `reauth.ts`**

Create `src/actions/reauth.ts`:

```ts
"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { CountryCode } from "plaid";
import { getPlaidClient } from "@/lib/plaid/client";
import { decrypt } from "@/lib/encryption";
import { getHouseholdId } from "@/lib/auth/session";
import { db as defaultDb, type LedgrDb } from "@/db";
import { plaidItems } from "@/db/schema";
import { syncInstitution } from "@/lib/plaid/sync";

export async function createUpdateLinkTokenDirect(
  plaidItemId: string,
  householdId: string,
  db: LedgrDb = defaultDb,
) {
  const item = db
    .select()
    .from(plaidItems)
    .where(and(eq(plaidItems.id, plaidItemId), eq(plaidItems.householdId, householdId)))
    .get();

  if (!item) {
    return { error: "Institution not found" };
  }

  if (item.status !== "reauth_required") {
    return { error: "Institution does not require re-authentication" };
  }

  try {
    const accessToken = decrypt(item.accessToken);
    const response = await getPlaidClient().linkTokenCreate({
      access_token: accessToken,
      client_name: "Ledgr",
      language: "en",
      country_codes: [CountryCode.Us],
      user: { client_user_id: householdId },
    });
    return { linkToken: response.data.link_token };
  } catch (e: unknown) {
    const plaidErr = e as { response?: { data?: { error_message?: string } } };
    console.error("Failed to create update link token:", plaidErr?.response?.data ?? e);
    return { error: plaidErr?.response?.data?.error_message ?? "Failed to initialize re-authentication" };
  }
}

export async function createUpdateLinkToken(plaidItemId: string) {
  const householdId = await getHouseholdId();
  return createUpdateLinkTokenDirect(plaidItemId, householdId);
}

export async function completeReAuthDirect(
  plaidItemId: string,
  householdId: string,
  db: LedgrDb = defaultDb,
) {
  const item = db
    .select()
    .from(plaidItems)
    .where(and(eq(plaidItems.id, plaidItemId), eq(plaidItems.householdId, householdId)))
    .get();

  if (!item) {
    return { error: "Institution not found" };
  }

  if (item.status !== "reauth_required") {
    return { error: "Institution does not require re-authentication" };
  }

  try {
    const accessToken = decrypt(item.accessToken);
    await getPlaidClient().itemGet({ access_token: accessToken });

    db.update(plaidItems)
      .set({ status: "active", errorCode: null, updatedAt: new Date().toISOString() })
      .where(eq(plaidItems.id, plaidItemId))
      .run();

    await syncInstitution(plaidItemId, householdId, db);

    return { success: true };
  } catch (e: unknown) {
    console.error("Re-auth completion failed:", e);
    return { error: "Re-authentication verification failed" };
  }
}

export async function completeReAuth(plaidItemId: string) {
  const householdId = await getHouseholdId();
  const result = await completeReAuthDirect(plaidItemId, householdId);
  if ("success" in result && result.success) {
    revalidatePath("/accounts");
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
pnpm test -- --run tests/integration/reauth.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/actions/reauth.ts tests/integration/reauth.test.ts
git commit -m "feat: add re-auth server actions with integration tests"
```

---

## Task 9: Fix `open()` Render-Time Bug in PlaidLinkFlow

**Files:**
- Modify: `src/components/organisms/plaid-link-flow.tsx:79-81`

This is a pre-existing bug — `open()` is called inline during render, which can loop on re-renders.

- [ ] **Step 1: Add `useEffect` import and replace the inline call**

In `src/components/organisms/plaid-link-flow.tsx`, add `useEffect` to the import on line 3:

```ts
import { useState, useRef, useCallback, useEffect } from "react";
```

Replace the inline `open()` call (lines 79-81):

```ts
  // Open Plaid Link once the token is set and the hook is ready
  if (linkToken && ready && !exchanging) {
    open();
  }
```

With a `useEffect`:

```ts
  useEffect(() => {
    if (linkToken && ready && !exchanging) {
      open();
    }
  }, [linkToken, ready, exchanging, open]);
```

- [ ] **Step 2: Verify typecheck**

Run:
```bash
pnpm typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/organisms/plaid-link-flow.tsx
git commit -m "fix: move open() call to useEffect to prevent render-loop"
```

---

## Task 10: Add Update Mode to PlaidLinkFlow

**Files:**
- Modify: `src/components/organisms/plaid-link-flow.tsx`

- [ ] **Step 1: Update the interface and imports**

In `src/components/organisms/plaid-link-flow.tsx`, update imports:

```ts
import { useState, useRef, useCallback, useEffect } from "react";
import { usePlaidLink } from "react-plaid-link";
import type { PlaidLinkError } from "react-plaid-link";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Building2, Link as LinkIcon } from "lucide-react";
import { createLinkToken, exchangePublicToken } from "@/actions/plaid";
import { createUpdateLinkToken, completeReAuth } from "@/actions/reauth";
```

Replace the interface:

```ts
interface PlaidLinkFlowProps {
  variant?: "primary" | "dropdown-item" | "reconnect-inline";
  label?: string;
  mode?: "connect" | "update";
  plaidItemId?: string;
  onReAuthSuccess?: () => void;
  onError?: (error: string) => void;
}
```

- [ ] **Step 2: Update the component logic**

Replace the full component body with:

```ts
export function PlaidLinkFlow({
  variant = "primary",
  label,
  mode = "connect",
  plaidItemId,
  onReAuthSuccess,
  onError,
}: PlaidLinkFlowProps) {
  const defaultLabel = mode === "update" ? "Reconnect" : "Connect Bank";
  const displayLabel = label ?? defaultLabel;

  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exchanging, setExchanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const onSuccess = useCallback(async (publicToken: string) => {
    setExchanging(true);
    setError(null);
    try {
      if (mode === "update" && plaidItemId) {
        const result = await completeReAuth(plaidItemId);
        if ("error" in result && result.error) {
          setError(result.error);
          onError?.(result.error);
        } else {
          onReAuthSuccess?.();
        }
      } else {
        const result = await exchangePublicToken(publicToken);
        if ("error" in result && result.error) {
          setError(result.error);
        }
      }
    } catch {
      const msg = mode === "update" ? "Re-authentication failed" : "Failed to connect account";
      setError(msg);
      onError?.(msg);
    } finally {
      setExchanging(false);
      setLinkToken(null);
      triggerRef.current?.focus();
    }
  }, [mode, plaidItemId, onReAuthSuccess, onError]);

  const onExit = useCallback(
    (err: PlaidLinkError | null) => {
      setLinkToken(null);
      if (err) {
        const msg = err.display_message || err.error_message || "Connection was interrupted";
        setError(msg);
        onError?.(msg);
      }
      triggerRef.current?.focus();
    },
    [onError]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
  });

  useEffect(() => {
    if (linkToken && ready && !exchanging) {
      open();
    }
  }, [linkToken, ready, exchanging, open]);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      if (mode === "update" && plaidItemId) {
        const result = await createUpdateLinkToken(plaidItemId);
        if ("error" in result && result.error) {
          setError(result.error);
          onError?.(result.error);
          return;
        }
        if ("linkToken" in result && result.linkToken) {
          setLinkToken(result.linkToken);
        }
      } else {
        const result = await createLinkToken();
        if ("error" in result && result.error) {
          setError(result.error);
          return;
        }
        if ("linkToken" in result && result.linkToken) {
          setLinkToken(result.linkToken);
        }
      }
    } catch {
      const msg = mode === "update" ? "Failed to initialize re-authentication" : "Failed to initialize bank connection";
      setError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  };

  const isLoading = loading || exchanging;
  const loadingText = mode === "update" ? "Reconnecting..." : "Connecting...";

  if (variant === "reconnect-inline") {
    return (
      <Button
        ref={triggerRef}
        variant="destructive"
        size="sm"
        onClick={handleClick}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <LinkIcon className="size-3.5" />
        )}
        {isLoading ? loadingText : displayLabel}
      </Button>
    );
  }

  if (variant === "dropdown-item") {
    return (
      <button
        ref={triggerRef}
        onClick={handleClick}
        disabled={isLoading}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted rounded-sm disabled:opacity-50"
      >
        {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Building2 className="size-4" />}
        {displayLabel}
      </button>
    );
  }

  return (
    <div>
      <Button
        ref={triggerRef}
        onClick={handleClick}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Plus className="size-4" />
        )}
        {exchanging ? loadingText : displayLabel}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
          <button
            onClick={handleClick}
            className="ml-2 underline hover:no-underline"
          >
            Retry
          </button>
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run:
```bash
pnpm typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/organisms/plaid-link-flow.tsx
git commit -m "feat: add update mode and reconnect-inline variant to PlaidLinkFlow"
```

---

## Task 11: Update InstitutionHeader with Reconnect Button

**Files:**
- Modify: `src/components/molecules/institution-header.tsx`

- [ ] **Step 1: Rewrite InstitutionHeader with `"use client"` and re-auth support**

Replace the full content of `src/components/molecules/institution-header.tsx`:

```tsx
"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/atoms/status-badge";
import { SyncStatusBadge, type SyncStatus } from "@/components/atoms/sync-status-badge";
import { PlaidLinkFlow } from "@/components/organisms/plaid-link-flow";

interface InstitutionHeaderProps {
  institutionName: string;
  status: "active" | "error" | "reauth_required" | "revoked" | null;
  accountCount: number;
  plaidItemId: string | null;
  lastSyncedAt: string | null;
  syncStatus: SyncStatus;
  syncError?: string;
  onSync: () => void;
  onReAuthSuccess?: () => void;
  reAuthError?: string | null;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function InstitutionHeader({
  institutionName,
  status,
  accountCount,
  plaidItemId,
  lastSyncedAt,
  syncStatus,
  syncError,
  onSync,
  onReAuthSuccess,
  reAuthError,
}: InstitutionHeaderProps) {
  return (
    <div>
      <div className="group flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <div>
            <h3 className="text-sm font-semibold">{institutionName}</h3>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {accountCount} {accountCount === 1 ? "account" : "accounts"}
              </p>
              {plaidItemId && lastSyncedAt && syncStatus === "idle" && (
                <>
                  <span className="text-xs text-muted-foreground">·</span>
                  <p className="text-xs text-muted-foreground">
                    Synced {formatRelativeTime(lastSyncedAt)}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SyncStatusBadge status={syncStatus} errorMessage={syncError} />
          {status && syncStatus === "idle" && <StatusBadge status={status} />}
          {status === "reauth_required" && plaidItemId ? (
            <PlaidLinkFlow
              mode="update"
              variant="reconnect-inline"
              plaidItemId={plaidItemId}
              onReAuthSuccess={onReAuthSuccess}
            />
          ) : plaidItemId ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSync}
              disabled={syncStatus === "syncing"}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <RefreshCw className="size-3.5" />
              <span className="sr-only">Sync Now</span>
            </Button>
          ) : null}
        </div>
      </div>
      {reAuthError && (
        <p role="alert" className="px-4 pb-2 text-xs text-destructive">
          {reAuthError}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update `StatusBadge` to accept `"revoked"` status**

In `src/components/atoms/status-badge.tsx`, update the interface and config:

```ts
interface StatusBadgeProps {
  status: "active" | "error" | "reauth_required" | "revoked";
}

const config = {
  active: { label: "Connected", dotClass: "bg-emerald-500" },
  error: { label: "Error", dotClass: "bg-amber-500" },
  reauth_required: { label: "Reconnect needed", dotClass: "bg-destructive" },
  revoked: { label: "Access revoked", dotClass: "bg-destructive" },
} as const;
```

- [ ] **Step 3: Verify typecheck**

Run:
```bash
pnpm typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/molecules/institution-header.tsx src/components/atoms/status-badge.tsx
git commit -m "feat: add reconnect button to InstitutionHeader for re-auth flow"
```

---

## Task 12: Wire Re-auth State in AccountList

**Files:**
- Modify: `src/components/organisms/account-list.tsx`

- [ ] **Step 1: Add re-auth state and callbacks**

Replace the full content of `src/components/organisms/account-list.tsx`:

```tsx
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AccountCard } from "@/components/molecules/account-card";
import { InstitutionHeader } from "@/components/molecules/institution-header";
import { EditAccountDialog } from "./edit-account-dialog";
import { triggerSync } from "@/actions/sync";
import type { InstitutionGroup, AccountRow } from "@/queries/accounts";
import type { SyncStatus } from "@/components/atoms/sync-status-badge";

interface SyncState {
  status: SyncStatus;
  error?: string;
}

interface AccountListProps {
  groups: InstitutionGroup[];
}

export function AccountList({ groups }: AccountListProps) {
  const [editingAccount, setEditingAccount] = useState<AccountRow | null>(null);
  const [syncStates, setSyncStates] = useState<Map<string, SyncState>>(new Map());
  const [reAuthingItemId, setReAuthingItemId] = useState<string | null>(null);
  const [reAuthError, setReAuthError] = useState<string | null>(null);
  const router = useRouter();

  const plaidItemIds = groups
    .map((g) => g.plaidItemId)
    .filter((id): id is string => id !== null);

  const handleSync = useCallback(async (itemId: string) => {
    setSyncStates((prev) => {
      const next = new Map(prev);
      next.set(itemId, { status: "syncing" });
      return next;
    });

    const result = await triggerSync(itemId);

    const newStatus: SyncStatus = result.success ? "success" : "error";

    setSyncStates((prev) => {
      const next = new Map(prev);
      next.set(itemId, {
        status: newStatus,
        error: result.success ? undefined : result.error,
      });
      return next;
    });

    router.refresh();

    if (newStatus === "success") {
      setTimeout(() => {
        setSyncStates((prev) => {
          const next = new Map(prev);
          next.delete(itemId);
          return next;
        });
      }, 3000);
    }
  }, [router]);

  const handleSyncAll = useCallback(async () => {
    await Promise.allSettled(plaidItemIds.map((id) => handleSync(id)));
  }, [plaidItemIds, handleSync]);

  const getSyncState = (itemId: string | null): SyncState =>
    (itemId ? syncStates.get(itemId) : undefined) ?? { status: "idle" };

  const handleReAuthSuccess = useCallback(() => {
    setReAuthingItemId(null);
    setReAuthError(null);
    router.refresh();
  }, [router]);

  const isSyncing = plaidItemIds.some((id) => getSyncState(id).status === "syncing");

  return (
    <>
      {plaidItemIds.length > 0 && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSyncAll}
            disabled={isSyncing || reAuthingItemId !== null}
          >
            <RefreshCw className="size-3.5 mr-1" />
            Sync All
          </Button>
        </div>
      )}

      <div className="space-y-6">
        {groups.map((group) => {
          const state = getSyncState(group.plaidItemId);
          return (
            <Card key={group.plaidItemId ?? "__manual__"}>
              <InstitutionHeader
                institutionName={group.institutionName}
                status={group.status}
                accountCount={group.accounts.length}
                plaidItemId={group.plaidItemId}
                lastSyncedAt={group.lastSyncedAt}
                syncStatus={state.status}
                syncError={state.error}
                onSync={() => group.plaidItemId && handleSync(group.plaidItemId)}
                onReAuthSuccess={handleReAuthSuccess}
                reAuthError={group.plaidItemId === reAuthingItemId ? reAuthError : null}
              />
              <Separator />
              <div>
                {group.accounts.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    onEdit={setEditingAccount}
                  />
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      <EditAccountDialog
        account={editingAccount}
        onClose={() => setEditingAccount(null)}
      />
    </>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run:
```bash
pnpm typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/organisms/account-list.tsx
git commit -m "feat: wire re-auth state management in AccountList"
```

---

## Task 13: Backfill Script

**Files:**
- Create: `src/db/seed/backfill-plaid-item-id.ts`

- [ ] **Step 1: Create the backfill script**

Create `src/db/seed/backfill-plaid-item-id.ts`:

```ts
import { isNull, eq } from "drizzle-orm";
import { db } from "@/db";
import { plaidItems } from "@/db/schema";
import { decrypt } from "@/lib/encryption";
import { getPlaidClient } from "@/lib/plaid/client";

async function backfill() {
  const items = db
    .select({ id: plaidItems.id, accessToken: plaidItems.accessToken })
    .from(plaidItems)
    .where(isNull(plaidItems.plaidItemId))
    .all();

  if (items.length === 0) {
    console.log("No items to backfill.");
    return;
  }

  console.log(`Backfilling ${items.length} item(s)...`);
  const client = getPlaidClient();

  for (const item of items) {
    try {
      const accessToken = decrypt(item.accessToken);
      const res = await client.itemGet({ access_token: accessToken });
      const plaidItemIdValue = res.data.item.item_id;

      db.update(plaidItems)
        .set({ plaidItemId: plaidItemIdValue })
        .where(eq(plaidItems.id, item.id))
        .run();

      console.log(`  ✓ ${item.id} → ${plaidItemIdValue}`);
    } catch (err) {
      console.error(`  ✗ ${item.id}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log("Backfill complete.");
}

backfill().catch(console.error);
```

- [ ] **Step 2: Commit**

```bash
git add src/db/seed/backfill-plaid-item-id.ts
git commit -m "feat: add one-shot backfill script for plaid_item_id column"
```

---

## Task 14: Run Full Test Suite and Typecheck

**Files:** None (verification only)

- [ ] **Step 1: Run typecheck**

Run:
```bash
pnpm typecheck
```

Expected: No errors.

- [ ] **Step 2: Run full test suite**

Run:
```bash
pnpm test -- --run
```

Expected: All tests pass, including the 16 new tests.

- [ ] **Step 3: Run lint**

Run:
```bash
pnpm lint
```

Expected: No errors. Fix any that appear.

- [ ] **Step 4: Final commit (if lint fixes needed)**

```bash
git add -A
git commit -m "fix: resolve lint issues from Phase 5 implementation"
```
