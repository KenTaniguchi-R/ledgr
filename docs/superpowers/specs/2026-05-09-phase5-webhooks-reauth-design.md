# Phase 5 — Webhooks + Re-auth Design Spec

## Overview

Add Plaid webhook handling for event-driven transaction syncing and implement the re-authentication flow for disconnected bank connections. This makes the app production-reliable: webhooks provide real-time sync, and re-auth prevents silent sync failures.

## Architecture Approach

**Layered backend** with extracted verification, handler map dispatch, and thin API route. **Extended frontend** — modify existing components rather than creating new ones. No new UI components needed; `PlaidLinkFlow` gains update mode support and `InstitutionHeader` gains a "Reconnect" button.

## Decisions

- `PLAID_SYNC_MODE=poll|webhook` env var controls webhook URL registration. Poll mode (4-hour cron) stays as-is and is the default.
- New `plaid_item_id` column on `plaid_items` with unique index for O(log n) webhook lookups.
- JWK/JWT webhook verification via `jose` (already installed). JWK cached by `kid` with 5-min TTL.
- Always return 200 from webhook route after verification passes — never cause Plaid retries from business logic errors.
- No re-auth banner — per-institution "Reconnect" button + existing `StatusBadge` is sufficient.
- No toast system — `StatusBadge` flip from red to green after `router.refresh()` is unambiguous.
- Extend `PlaidLinkFlow` with `mode` prop — no separate `PlaidReAuthFlow` component.

---

## Backend

### New Files

#### `src/lib/plaid/webhook-verify.ts`

Pure async verification function.

```
verifyWebhookSignature(rawBody: string, plaidVerificationHeader: string): Promise<WebhookPayload>
```

- Decode JWT header to extract `kid`
- Fetch JWK via `webhookVerificationKeyGet({ key_id: kid })` using `getPlaidClient()`
- Cache JWK by `kid` in module-level `Map<string, { key: CryptoKey; expiresAt: number }>` with 5-min TTL, max 10 entries (evict oldest on overflow to prevent memory exhaustion from fake `kid` values)
- Deduplicate in-flight JWK fetches: if a fetch for a given `kid` is already pending, await the same Promise instead of issuing a parallel request
- Verify JWT signature using `jose.jwtVerify`
- **Replay protection:** After signature verification, check JWT `iat` claim — reject if `Date.now() / 1000 - payload.iat > 300` (5-minute window). This prevents captured webhooks from being replayed.
- Compare `request_body_sha256` JWT claim against `SHA-256(rawBody)` — reject if mismatch
- On verification failure: clear cache for that `kid` and retry once (handles key rotation)
- Throw `WebhookVerificationError` on failure (custom error class in same file)

#### `src/lib/plaid/webhook-handlers.ts`

Handler map and dispatch logic.

```ts
type WebhookContext = { db: LedgrDb; payload: WebhookPayload }
type WebhookHandler = (ctx: WebhookContext) => Promise<void>

const WEBHOOK_HANDLERS: Record<string, WebhookHandler> = {
  "TRANSACTIONS:SYNC_UPDATES_AVAILABLE": handleSyncUpdates,
  "ITEM:ERROR": handleItemError,
  "ITEM:PENDING_EXPIRATION": handlePendingExpiration,
  "ITEM:USER_PERMISSION_REVOKED": handlePermissionRevoked,
}

export async function dispatchWebhook(payload: WebhookPayload, db?: LedgrDb): Promise<void>
```

**Handler details:**

- `handleSyncUpdates` — Look up `plaid_items` by `plaid_item_id` (new indexed column). Call `syncInstitution(item.id, item.householdId, db)`. The per-item lock in `syncInstitution` prevents races with cron.
- `handleItemError` — Guard: `if (!payload.error) { log warning and return }` (malformed payloads). Check `payload.error.error_code` against existing `REAUTH_ERROR_CODES` set (exported from `sync.ts` — both `REAUTH_ERROR_CODES` and `TRANSIENT_ERROR_CODES` need `export` added). If match: set `status = "reauth_required"`. Check against `TRANSIENT_ERROR_CODES`: set `status = "error"`. Write `error_code` to `plaid_items`.
- `handlePendingExpiration` — Set `status = "reauth_required"` (user needs to re-auth before access expires).
- `handlePermissionRevoked` — Set `status = "revoked"` and stop syncing. User revoked access via their bank's portal — this is not a re-auth candidate. Add `"revoked"` to the `plaid_items.status` enum.
- Unknown webhook types/codes → no-op, log and return.

**Note on lookups:** When `plaid_item_id` lookup returns no row, log a warning (item may not have been backfilled or was deleted). Do not throw — return silently.

`dispatchWebhook` keys on `"${webhook_type}:${webhook_code}"`, looks up the handler map, calls the handler if found. Injectable `db` parameter for testability.

#### `src/app/api/plaid/webhook/route.ts`

Thin route handler (~25 lines).

```ts
export async function POST(request: Request) {
  const rawBody = await request.text();
  const verificationHeader = request.headers.get("Plaid-Verification");

  if (!verificationHeader) {
    // Return 200 to avoid leaking endpoint existence to scanners
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
    // Business logic errors still return 200 to prevent Plaid retries
    return NextResponse.json({ status: "ok" });
  }
}
```

#### `src/actions/reauth.ts`

Two server actions for the re-auth flow.

**`createUpdateLinkToken(plaidItemId: string)`**
1. `getHouseholdId()` — auth gate
2. Look up `plaid_items` by `id` + `householdId` (ownership check via `scopedQuery`)
3. Guard: verify `status === "reauth_required"`
4. `decrypt(item.accessToken)` to get raw access token
5. Call `getPlaidClient().linkTokenCreate({ access_token: decryptedToken, client_name: "Ledgr", language: "en", country_codes: [CountryCode.Us], user: { client_user_id: householdId } })` — `user.client_user_id` is required by Plaid in production. Do NOT pass `webhook` — Plaid ignores it in update mode (use `itemWebhookUpdate` to change webhook URLs on existing items).
6. Return `{ linkToken: response.data.link_token }` or `{ error: string }`

**`completeReAuth(plaidItemId: string)`**
1. `getHouseholdId()` — auth gate
2. Ownership check
3. Guard: verify `status === "reauth_required"` — reject if item is already active (prevents redundant syncs from direct API calls)
4. Call `getPlaidClient().itemGet({ access_token: decrypt(item.accessToken) })` to confirm item is healthy on Plaid's side
5. `db.update(plaidItems).set({ status: "active", errorCode: null, updatedAt: new Date().toISOString() }).where(...)`
6. Call `syncInstitution(item.id, item.householdId)` to fetch any missed transactions. Note: Plaid may also fire a `SYNC_UPDATES_AVAILABLE` webhook after re-auth — the per-item lock in `syncInstitution` deduplicates if both arrive close together.
7. `revalidatePath("/accounts")`
8. Return `{ success: true }` or `{ error: string }`

#### `src/db/seed/backfill-plaid-item-id.ts`

One-shot script for existing installations.

- Query all `plaid_items` where `plaidItemId IS NULL`
- For each: `decrypt(accessToken)` → `client.itemGet({ access_token })` → write `item.item_id` back to `plaidItemId`
- Run via `pnpm tsx src/db/seed/backfill-plaid-item-id.ts`
- Not a Drizzle migration (migrations can't call external APIs)

### Modified Files

#### `src/db/schema/plaid.ts`

Add column to `plaid_items`:
```ts
plaidItemId: text("plaid_item_id"),
```

Add unique index:
```ts
uniqueIndex("idx_plaid_items_plaid_item_id").on(table.plaidItemId)
```

Column is nullable (backfill happens separately).

#### `src/actions/plaid.ts`

In `exchangeAndStoreAccounts`, store `plaid_item_id` from Plaid's response:
```ts
plaidItemId: itemRes.data.item.item_id,
```

#### `src/lib/plaid/schemas.ts`

Add Zod schema for webhook payloads:
```ts
export const WebhookPayloadSchema = z.object({
  webhook_type: z.string(),
  webhook_code: z.string(),
  item_id: z.string(),
  error: z.object({
    error_type: z.string(),
    error_code: z.string(),
    error_message: z.string(),
  }).nullable().optional(),
});
export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;
```

#### `src/middleware.ts`

Add to `publicPaths`:
```ts
"/api/plaid/webhook"
```

### Data Flow

```
Plaid POST /api/plaid/webhook
  → middleware: publicPaths bypass (no auth check)
  → route.ts: read raw body as text, read Plaid-Verification header
  → verifyWebhookSignature(rawBody, header)
       → decode JWT header → extract kid
       → fetch JWK from cache or webhookVerificationKeyGet (max 10 cached, dedup in-flight)
       → jwtVerify(JWT, key)
       → reject if iat > 5 minutes old (replay protection)
       → SHA-256(rawBody) === JWT.request_body_sha256
  → parse body with WebhookPayloadSchema (Zod)
  → dispatchWebhook(payload, db)
       → lookup plaid_items by plaid_item_id (unique index)
       → TRANSACTIONS:SYNC_UPDATES_AVAILABLE → syncInstitution()
       → ITEM:ERROR → classify error code → update plaid_items.status
       → ITEM:PENDING_EXPIRATION → set reauth_required
  → return 200
```

---

## Frontend

### Design Direction

**Calm urgency.** Re-auth is routine maintenance (like re-entering a password), not a crisis. Use the existing `destructive` color system at low opacity — `bg-destructive/10 text-destructive` — consistent with the app's soft tint approach.

### Modified Files

#### `src/components/organisms/plaid-link-flow.tsx`

Add update mode support.

**New props:**
```ts
interface PlaidLinkFlowProps {
  variant?: "primary" | "dropdown-item" | "reconnect-inline";
  label?: string;
  mode?: "connect" | "update";
  plaidItemId?: string;           // required when mode === "update"
  onReAuthSuccess?: () => void;   // called after update mode succeeds
}
```

**Behavior changes:**
- **Bug fix (existing):** Move `open()` call from inline render to `useEffect(() => { if (linkToken && ready && !exchanging) open(); }, [linkToken, ready, exchanging, open])`. The current inline call can loop on re-renders — this affects both connect and update mode.
- `handleClick` branches on `mode`:
  - `"connect"` → `createLinkToken()` (existing)
  - `"update"` → `createUpdateLinkToken(plaidItemId!)`
- `onSuccess` branches on `mode`:
  - `"connect"` → `exchangePublicToken(publicToken)` (existing)
  - `"update"` → `completeReAuth(plaidItemId!)` then `onReAuthSuccess?.()`
- New `"reconnect-inline"` variant renders a single `<Button variant="destructive" size="sm">` with `LinkIcon` — no wrapping div, fits inline in `InstitutionHeader`'s flex row
- Loading text: "Reconnecting..." for update mode
- Error display for reconnect-inline: show error text below the institution name line (where `lastSyncedAt` lives) via an `onError` callback prop to `InstitutionHeader`. Using `aria-describedby` to link error to the button for accessibility. Do NOT use tooltip-only errors — they fail on touch devices and don't meet WCAG 1.3.1.
- **TypeScript enforcement:** Use discriminated union or runtime assertion for `plaidItemId` when `mode === "update"` — not just a comment saying "required"

#### `src/components/molecules/institution-header.tsx`

Add `"use client"` directive (needed for hosting `PlaidLinkFlow`). Does NOT use `useRouter` — refresh is handled by `AccountList` via callback props, consistent with the existing `onSync` pattern.

**New props:**
```ts
onReAuthSuccess?: () => void;  // called after re-auth completes — AccountList passes () => router.refresh()
reAuthError?: string | null;   // error from PlaidLinkFlow, displayed below institution name
```

**Render logic when `status === "reauth_required"` and `syncStatus === "idle"`:**

```tsx
{status === "reauth_required" && plaidItemId ? (
  <PlaidLinkFlow
    mode="update"
    variant="reconnect-inline"
    plaidItemId={plaidItemId}
    label="Reconnect"
    onReAuthSuccess={onReAuthSuccess}
    onError={(err) => /* passed up via callback */}
  />
) : plaidItemId ? (
  <Button variant="ghost" size="sm" onClick={onSync} ...>
    <RefreshCw className="size-3.5" />
  </Button>
) : null}

{/* Error shown below institution name line */}
{reAuthError && (
  <p role="alert" className="text-xs text-destructive px-4">{reAuthError}</p>
)}
```

- "Reconnect" button is **always visible** (not hover-reveal) — persistent error states need persistent CTAs
- **Replaces "Sync Now"** when `reauth_required` — syncing a broken connection is pointless
- `StatusBadge` continues showing red dot + "Reconnect needed" alongside the button
- No `useRouter` in InstitutionHeader — `AccountList` owns `router` and passes `onReAuthSuccess={() => router.refresh()}` as a prop, same pattern as `onSync`

#### `src/components/organisms/account-list.tsx`

**Changes:**
- Pass `onReAuthSuccess={() => router.refresh()}` to each `InstitutionHeader` (same pattern as `onSync`)
- Track `reAuthingItemId: string | null` state — set when PlaidLinkFlow starts re-auth (via `onReAuthStart` callback from InstitutionHeader), cleared on success/error
- Disable "Sync All" button when `reAuthingItemId` is set (syncing during re-auth is pointless)
- Pass `reAuthError` state down to InstitutionHeader for inline error display
- Re-auth state is mostly self-contained in PlaidLinkFlow, but AccountList needs awareness of in-progress re-auth to disable conflicting actions

### User Interaction Flow

```
1. User sees red dot + "Reconnect needed" on Chase card
   StatusBadge shows persistent error indicator

2. User clicks "Reconnect" button (always visible, destructive styling)
   PlaidLinkFlow (reconnect-inline variant) fires handleClick

3. handleClick calls createUpdateLinkToken(plaidItemId)
   Button shows spinner + "Reconnecting..."

4. Link token received → Plaid Link opens in update mode
   User re-enters bank credentials

5. Plaid Link onSuccess fires
   completeReAuth(plaidItemId) → resets status to active, triggers sync

6. router.refresh() picks up new status from DB
   StatusBadge flips to green dot + "Connected"
```

### Error State: Transient Errors

When `status === "error"` (e.g., `INSTITUTION_DOWN`):

- `StatusBadge` shows amber dot + "Error" (already implemented)
- "Sync Now" button remains available (hover-reveal) — user can retry
- Transient errors resolve on next successful sync (no special UI treatment)

---

## Schema Migration

### Step 1: Add column (nullable)
```sql
ALTER TABLE plaid_items ADD COLUMN plaid_item_id TEXT;
```

### Step 2: Backfill existing items
Run `pnpm tsx src/db/seed/backfill-plaid-item-id.ts` — calls Plaid API for each existing item.

### Step 3: Add unique index
```sql
CREATE UNIQUE INDEX idx_plaid_items_plaid_item_id ON plaid_items(plaid_item_id);
```

Column stays nullable (items created before this migration may not have been backfilled if the script wasn't run).

---

## Testing Strategy

### New Test Files

#### `src/lib/plaid/webhook-verify.test.ts` (colocated unit tests)

Generate test EC key pair using Node `crypto.generateKeyPairSync` + `jose.exportJWK`. Create valid test JWTs with `jose.SignJWT`.

Tests (~5):
- Valid signature + matching body hash → returns parsed payload
- Tampered body (SHA-256 mismatch) → throws `WebhookVerificationError`
- Invalid/expired JWT → throws
- Stale `iat` (>5 min old) → throws `WebhookVerificationError` (replay protection)
- Key rotation: first verify fails, cache cleared, retry with new key succeeds

#### `tests/integration/webhook-handler.test.ts` (dispatch layer)

Uses `createTestDb()`. Calls `dispatchWebhook(payload, db)` directly — no HTTP layer.

Tests (~7):
- `TRANSACTIONS:SYNC_UPDATES_AVAILABLE` → sync triggered (verify `sync_log` entry)
- `ITEM:ERROR` with `ITEM_LOGIN_REQUIRED` → status set to `reauth_required`
- `ITEM:ERROR` with `INSTITUTION_DOWN` → status set to `error`
- `ITEM:ERROR` with missing `error` field → no-op (null guard)
- `ITEM:PENDING_EXPIRATION` → status set to `reauth_required`
- `ITEM:USER_PERMISSION_REVOKED` → status set to `revoked`
- Unknown webhook type → no-op, no error

#### `tests/integration/reauth.test.ts`

Tests (~3):
- `createUpdateLinkToken`: ownership check passes, returns link token
- `createUpdateLinkToken`: wrong household → rejected
- `completeReAuth`: resets status to active, clears error code, triggers sync

### Modified Test Files

#### `tests/mocks/handlers.ts`

Add MSW handlers:
- `webhookVerificationKeyGet` → returns mock JWK
- `itemGet` → returns item metadata (for `completeReAuth` verification)

### Test Budget

~16 new tests total. CI pipeline unchanged: `typecheck → lint → vitest → stryker (incremental) → playwright`.

---

## Environment Variables

No new env vars needed. Existing vars used:

| Variable | Purpose |
|----------|---------|
| `PLAID_CLIENT_ID` | Plaid API auth |
| `PLAID_SECRET` | Plaid API auth + webhook key lookup |
| `PLAID_ENV` | sandbox/development/production |
| `PLAID_SYNC_MODE` | `poll` (default) or `webhook` |
| `PLAID_WEBHOOK_URL` | Webhook endpoint URL (only needed when mode=webhook) |
| `ENCRYPTION_KEY` | Decrypt access tokens for re-auth flow |

---

## Security

- Webhook route is unauthenticated by design (Plaid calls it). JWK/JWT verification is the trust boundary.
- **Replay protection:** JWT `iat` must be within 5 minutes of current time. Stale webhooks are rejected.
- **DoS mitigation:** JWK cache capped at 10 entries (evict oldest). In-flight fetches deduplicated by `kid`. Prevents attackers from exhausting Plaid API rate limits by spamming fake `kid` values.
- Raw body is hashed and compared to JWT claim before JSON parsing — prevents body tampering.
- JWK is fetched from Plaid's API (not a shared secret) — key rotation is handled automatically.
- Never log raw webhook body after verification — may contain partial account data.
- Return 200 for missing verification header (not 400) to avoid confirming endpoint existence to scanners. Return 400 only for actual verification failures.
- `createUpdateLinkToken` and `completeReAuth` both enforce household ownership AND status guards (`reauth_required` check) — no cross-tenant re-auth, no redundant operations.
- Per-item sync lock is process-local only. In single-process deployments (SQLite target), this is sufficient. Multi-process deployments would need DB-level locking (out of scope — SQLite doesn't support multi-process writes anyway).

---

## Files Summary

### New Files (8)
| File | Purpose |
|------|---------|
| `src/lib/plaid/webhook-verify.ts` | JWT/JWK webhook signature verification |
| `src/lib/plaid/webhook-handlers.ts` | Handler map + dispatch logic |
| `src/app/api/plaid/webhook/route.ts` | Thin API route |
| `src/actions/reauth.ts` | `createUpdateLinkToken` + `completeReAuth` server actions |
| `src/db/seed/backfill-plaid-item-id.ts` | One-shot backfill script |
| `src/lib/plaid/webhook-verify.test.ts` | Verification unit tests |
| `tests/integration/webhook-handler.test.ts` | Dispatch integration tests |
| `tests/integration/reauth.test.ts` | Re-auth action integration tests |

### Modified Files (8)
| File | Change |
|------|--------|
| `src/db/schema/plaid.ts` | Add `plaidItemId` column + unique index, add `"revoked"` to status enum |
| `src/actions/plaid.ts` | Store `plaid_item_id` during token exchange |
| `src/lib/plaid/sync.ts` | Export `REAUTH_ERROR_CODES` and `TRANSIENT_ERROR_CODES` |
| `src/lib/plaid/schemas.ts` | Add `WebhookPayloadSchema` |
| `src/middleware.ts` | Add webhook to `publicPaths` |
| `src/components/organisms/plaid-link-flow.tsx` | Add `mode`, `plaidItemId`, `reconnect-inline` variant, fix `open()` useEffect bug |
| `src/components/molecules/institution-header.tsx` | Add `"use client"`, render `PlaidLinkFlow` for re-auth, error display |
| `src/components/organisms/account-list.tsx` | Add `reAuthingItemId` state, pass re-auth callbacks to InstitutionHeader |
