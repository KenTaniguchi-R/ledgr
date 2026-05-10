# Phase 3 — Transaction Sync Engine Design

**Date:** 2026-05-09
**Status:** Reviewed
**Depends on:** Phase 2 (Plaid Link + Token Exchange) ✅

## Overview

Phase 3 implements cursor-based transaction sync via Plaid's `transactions/sync` endpoint, a background job scheduler, and "Sync Now" UI controls. This is the core data pipeline — without it, there's nothing to display, categorize, or budget against.

## Architecture

### Sync Engine Pipeline

`syncInstitution(itemId, householdId, db)` orchestrates three pure steps:

```
0. Acquire per-item lock (in-process Map<itemId, Promise>)
   → Prevents concurrent sync of the same item (cron + manual race)

1. fetchAllPages(plaidClient, accessToken, cursor)
   → If cursor is null (initial sync), omit cursor field from request entirely
   → Loops transactionsSync() until has_more=false
   → Retries each page call with exponential backoff (3 attempts, jitter)
   → Validates response against Zod schema (parse-don't-trust)
   → Returns: { added[], modified[], removed[], nextCursor, accounts[] }

2. processBatch(added, modified, householdId, accountTypeMap)
   → Converts Plaid floats → integer cents
   → Computes normalized_amount with account-type-aware sign handling
   → Builds merchant upsert payloads (name normalization, raw_names tracking)
   → Detects pending→posted transitions via pending_transaction_id
   → Returns: { inserts[], upserts[], merchantUpserts[], pendingToRemove[] }

3. applyToDb(db, processed, itemId, newCursor)
   → Single db.transaction():
     - Upsert merchants → resolve merchant_id FKs
     - INSERT new transactions (UNIQUE on plaid_transaction_id prevents dupes)
     - UPSERT modified transactions by plaid_transaction_id
     - Soft-delete removed transactions (set deleted_at)
     - Soft-delete pending rows replaced by posted versions
     - Update account balances (current, available, limit) from Plaid response
     - Update plaid_items.sync_cursor
     - INSERT sync_log entry
```

**Key invariants:**
- Cursor update and record writes are atomic in a single SQLite transaction. A crash mid-sync loses no data — the next sync resumes from the last committed cursor.
- Per-item in-process lock prevents concurrent sync of the same institution (cron job + manual "Sync Now" race condition). Lock is a `Map<string, Promise<SyncResult>>` — if a sync is already in progress for an item, `syncInstitution` awaits the existing promise instead of starting a new one.

### Error Handling

On Plaid API errors during `fetchAllPages`:
- `ITEM_LOGIN_REQUIRED`, `INVALID_CREDENTIALS`, `INVALID_MFA`, `INSUFFICIENT_CREDENTIALS`, `USER_INPUT_NEEDED` → set `plaid_items.status = 'reauth_required'`
- `INSTITUTION_DOWN`, `TRANSACTIONS_LIMIT`, `INTERNAL_SERVER_ERROR` → set `plaid_items.status = 'error'`, store error code in `plaid_items.error_code`
- `RATE_LIMIT_EXCEEDED` → handled by retry with backoff (up to 3 attempts per page)
- Any unrecoverable error → write `sync_log` entry with error, return `{ success: false, error }`

### Return Value

```typescript
type SyncResult =
  | { success: true; addedCount: number; modifiedCount: number; removedCount: number; syncedAt: string }
  | { success: false; error: string }
```

## Amount Handling

**Plaid sign conventions vary by account type:**

| Account Type | Plaid Convention | Example |
|-------------|-----------------|---------|
| Depository (checking, savings) | Positive = debit/expense, negative = credit/income | Purchase: `12.50`, deposit: `-500.00` |
| Credit | Negative = purchase/expense, positive = payment/credit | Purchase: `-50.00`, payment: `200.00` |
| Investment | Negative = buy, positive = sell | Buy: `-1000.00`, sell: `500.00` |

**Storage:**

| Field | Convention |
|-------|-----------|
| `amount` | Integer cents, raw Plaid convention preserved: `Math.round(plaidAmount * 100)` |
| `normalized_amount` | Integer cents, **account-type-aware normalization** so that positive always = income, negative always = expense |

**Normalization logic:**

```typescript
function normalizeAmount(amountCents: number, accountType: string): number {
  // Depository: Plaid positive = expense → flip sign
  // Credit: Plaid negative = expense → DON'T flip (already correct for normalized)
  // Investment: Plaid negative = buy (expense) → DON'T flip
  const shouldFlip = accountType === "depository";
  const normalized = shouldFlip ? -amountCents : amountCents;
  return normalized === 0 ? 0 : normalized; // -0 guard
}
```

`processBatch` receives an `accountTypeMap: Map<plaidAccountId, accountType>` built from the accounts table to determine the correct normalization per transaction.

## Merchant Normalization

Full merchant normalization happens during sync (not deferred to Phase 4).

```
For each transaction with merchant_name from Plaid:
  1. Normalize: trim whitespace, title-case
  2. Lookup merchant by (household_id, normalized_name)
  3. If exists → append raw Plaid name to raw_names JSON array (if not already present)
  4. If not exists → INSERT new merchant { name, raw_names: [rawName], logo_url }
  5. Set transaction.merchant_id = merchant.id

Transactions without merchant_name → merchant_id = null
```

- `category_id` left null on merchants — Phase 4 categorization pipeline fills this
- `raw_names` is a JSON array stored as TEXT, enabling future fuzzy matching

## Pending → Posted Transitions

Plaid may assign a **new** `plaid_transaction_id` when a pending transaction posts. The link is the `pending_transaction_id` field on the posted version.

```
When processing added transactions:
  1. If transaction has pending_transaction_id:
     a. Find existing row WHERE plaid_transaction_id = pending_transaction_id AND pending = true
     b. Soft-delete the pending row (set deleted_at)
     c. Insert the posted version as a new row (pending = false)
  2. If no pending_transaction_id → normal INSERT

When processing removed transactions:
  3. Soft-delete by plaid_transaction_id (set deleted_at)
  4. This handles both posted removals AND pending transactions that never post
     (declined charges, expired pre-auth holds). Both are legitimate terminal states.
```

## Background Job Scheduler

`src/lib/jobs/scheduler.ts` — node-cron running in-process.

| Job | Schedule | Phase |
|-----|----------|-------|
| Plaid transaction sync | Every 4 hours | Phase 3 |
| Balance snapshot | Daily midnight | Phase 6 |
| Recurring detection | Daily 1am | Phase 10 |
| Holdings snapshot | Daily 2am | Phase 11 |
| AI batch categorization | Every 4 hours (after sync) | Phase 12 |

Phase 3 implements only the sync job. The scheduler is designed to be extended by later phases.

```typescript
// src/lib/jobs/scheduler.ts
import cron from "node-cron";

export function startScheduler() {
  cron.schedule("0 */4 * * *", async () => {
    // Fetch all active plaid_items, sync each
  });
}
```

**Sync mode:** Controlled by `PLAID_SYNC_MODE` env var:
- `poll` (default): cron polls on schedule. No public URL needed.
- `webhook`: Phase 5 adds webhook-triggered sync. Not implemented in Phase 3.

The scheduler starts in `instrumentation.ts` (Next.js server startup hook) — only in production, not during builds or dev (controlled by `NEXT_RUNTIME` check).

## Server Actions

### `src/actions/sync.ts`

```typescript
"use server";

// Manual sync for one institution
export async function triggerSync(plaidItemId: string): Promise<SyncResult> {
  const householdId = await getHouseholdId(); // throws if unauth
  // Verify plaidItemId belongs to householdId (security check)
  // Call syncInstitution(plaidItemId, householdId, db)
  // revalidatePath("/accounts")
  // Return { success, addedCount, modifiedCount, removedCount, syncedAt }
}

// No triggerSyncAll server action — the client orchestrates parallel
// triggerSync() calls via Promise.allSettled(). Each call is independent,
// shows per-institution progress honestly, and the per-item lock in
// syncInstitution prevents races. SQLite WAL handles concurrent writes
// from separate transactions fine.
```

**Auth convention (standardized):** All server actions use `getHouseholdId()` which throws on unauthenticated — Next.js error boundary handles it. No more mixed `getSession()` null-check pattern.

## UI Components

### Design Language

Matches existing Ledgr aesthetic: Geist font, OKLch neutrals, Lucide icons, color reserved for status. No new visual language.

### `SyncStatusBadge` (atom)

```
src/components/atoms/sync-status-badge.tsx
```

| Status | Render |
|--------|--------|
| `idle` | Nothing (no visual noise) |
| `syncing` | Loader2 (animate-spin) + "Syncing..." — text-xs text-muted-foreground |
| `success` | Check icon + "Synced" — text-xs text-emerald-500, fades out after 3s |
| `error` | AlertCircle + "Sync failed" — text-xs text-destructive, tooltip with error message |

- Icons: Lucide, size-3.5 (matches existing atoms)
- Transitions: `transition-opacity duration-300`
- No background chrome — icon + text only
- Container has `role="status"` and `aria-live="polite"` for screen reader announcements
- Success auto-clear uses `useEffect` with `clearTimeout` cleanup on unmount

### `InstitutionHeader` (molecule — updated)

```
┌─────────────────────────────────────────────────────────────┐
│  🏦 Chase          ·  Last synced 2h ago    [↻ Sync Now]   │
│                     SyncStatusBadge                          │
└─────────────────────────────────────────────────────────────┘
```

- Last synced: `text-xs text-muted-foreground`, relative time format
- Sync Now: `variant="ghost" size="sm"`, Lucide `RefreshCw` (size-3.5)
- Sync Now reveal: `opacity-0 group-hover:opacity-100 transition-opacity` (matches AccountCard edit pattern)
- Disabled during sync: `opacity-50 pointer-events-none`
- **Hidden for manual accounts** — `InstitutionHeader` receives `plaidItemId: string | null`. When null (manual/CSV accounts), Sync Now button and last-synced timestamp are not rendered.
- New props: `plaidItemId: string | null`, `lastSyncedAt: string | null`, `syncStatus: SyncStatus`, `onSync: () => void`

### `AccountList` (organism — updated)

```
┌─────────────────────────────────────────────────────┐
│  Accounts                              [↻ Sync All] │
│─────────────────────────────────────────────────────│
│  InstitutionHeader (Chase)        [↻ Sync Now]      │
│    AccountCard (Checking) ...                        │
│  InstitutionHeader (Amex)         [↻ Sync Now]      │
│    AccountCard (Platinum) ...                        │
└─────────────────────────────────────────────────────┘
```

- State: `useState<Map<string, SyncStatus>>` keyed by plaidItemId (always create new Map on update to trigger re-render — never mutate in place)
- Sync All: ghost button in header, fires `Promise.allSettled(itemIds.map(id => handleSync(id)))` — parallel independent calls. Each institution's badge updates independently as its sync resolves.
- `revalidatePath` in server action invalidates RSC cache. Client calls `router.refresh()` after action resolves to pull fresh data into mounted components.

## File Structure

### New Files

```
src/lib/plaid/sync.ts              — syncInstitution, fetchAllPages, processBatch, applyToDb
src/lib/plaid/sync.test.ts         — colocated unit + property tests
src/lib/plaid/schemas.ts           — Zod schemas for Plaid sync response validation
src/lib/jobs/scheduler.ts          — node-cron setup
src/actions/sync.ts                — triggerSync server action
src/components/atoms/sync-status-badge.tsx
tests/integration/transaction-sync.test.ts
```

### Modified Files

```
src/actions/plaid.ts               — fix createManualAccount db injection + auth guard
src/queries/accounts.ts            — fix getAccountsByInstitution to use scopedQuery
src/components/molecules/institution-header.tsx — add Sync Now + last synced
src/components/organisms/account-list.tsx       — add sync state + Sync All
src/app/(dashboard)/accounts/page.tsx           — pass plaidItemIds to organisms
tests/mocks/handlers.ts            — add 4 sync fixtures
```

## Refactoring (Pre-Phase 3)

Three consistency fixes before building new code:

1. **`actions/plaid.ts` — `createManualAccount`:** Add `db: LedgrDb = defaultDb` parameter (matches `exchangeAndStoreAccounts` pattern)
2. **`queries/accounts.ts` — `getAccountsByInstitution`:** Replace raw `eq(plaidItems.householdId, householdId)` with `scopedQuery` wrapper
3. **`actions/plaid.ts` — `createLinkToken`:** Replace `getSession()` null-check with `getHouseholdId()` (standardize auth guard across all actions)

## Testing Strategy

### MSW Fixtures (`tests/mocks/handlers.ts`)

| Fixture | Purpose |
|---------|---------|
| `syncPageOne` | `has_more: true`, 3 added txns (1 pending), cursor → "page2" |
| `syncPageTwo` | `has_more: false`, 1 added (pending→posted with new ID), cursor → "final" |
| `syncWithModified` | 1 modified txn (changed amount) |
| `syncWithRemoved` | 1 removed txn ID |

### Integration Tests (`tests/integration/transaction-sync.test.ts`)

8 behavioral tests. Each test gets a fresh `createTestDb()` and seeds the prerequisite chain (household → plaid_item → accounts). MSW lifecycle: `server.use()` per test + `server.resetHandlers()` in `afterEach`. Shared test constants for transaction IDs (used by both fixtures and DB seeds).

1. **Multi-page pagination drains all pages** — all txns inserted, cursor = "final"
2. **Removed transactions are soft-deleted** — `deleted_at IS NOT NULL`
3. **Modified transactions upsert without duplicates** — row count stays 1, amount updated
4. **Pending→posted transition** — pending row soft-deleted, posted row inserted
5. **Cursor atomicity** — cursor unchanged if write fails mid-transaction
6. **Empty sync** — no changes from Plaid, cursor advances, sync_log written with zero counts
7. **Duplicate plaid_transaction_id rejected** — UNIQUE constraint prevents duplicate inserts
8. **Cross-household isolation** — sync for household A does not affect household B's data

### Server Action Tests (`tests/integration/sync-actions.test.ts`)

3 tests for security-critical paths:

1. **Auth guard** — unauthenticated call throws
2. **Ownership check** — triggerSync with plaidItemId from another household returns error
3. **Plaid error → item status update** — ITEM_LOGIN_REQUIRED sets plaid_items.status = 'reauth_required'

### Colocated Unit Tests (`src/lib/plaid/sync.test.ts`)

- `processBatch` — cents conversion, account-type-aware normalized_amount, merchant payload shape
- Amount edge cases: zero (-0 guard), large amounts, negative credits
- Credit card amount normalization (Plaid negative = expense → normalized stays negative)

### Property Tests

```typescript
test.prop([fc.float({ min: -99999.99, max: 99999.99, noNaN: true })])(
  "plaidAmountToCents sign symmetry",
  (amount) => {
    expect(Math.abs(plaidAmountToCents(amount))).toBe(Math.abs(plaidAmountToCents(-amount)));
  }
)

test.prop([fc.float({ min: -99999.99, max: 99999.99, noNaN: true })])(
  "plaidAmountToCents always returns integer",
  (amount) => {
    expect(Number.isInteger(plaidAmountToCents(amount))).toBe(true);
  }
)

// -0 guard
test("plaidAmountToCents(0) is not negative zero", () => {
  expect(Object.is(plaidAmountToCents(0), -0)).toBe(false);
});
```

### Zod Contract Schemas (`src/lib/plaid/schemas.ts`)

Validate Plaid responses at runtime in `fetchAllPages` (parse-don't-trust pattern). Also validate MSW fixtures against the same schemas in tests to keep fixtures honest. Schemas for: sync response envelope, transaction object, removed notification.

### No E2E for Phase 3

Sync is server-side. The "Sync Now" button will be implicitly tested when Phase 4 adds transaction list E2E.

### MSW Lifecycle

Tests must follow this lifecycle to prevent fixture bleed:

```typescript
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

Per-test fixture overrides via `server.use(...syncPageOne, ...syncPageTwo)` — these are reset after each test.

## Schema Changes (Add in Migration)

```sql
-- New UNIQUE constraint (prevents duplicate transactions from concurrent sync race)
CREATE UNIQUE INDEX idx_txn_plaid_id_unique ON transactions(plaid_transaction_id) WHERE plaid_transaction_id IS NOT NULL;

-- Performance indexes
CREATE INDEX idx_sync_log_plaid_item_id ON sync_log(plaid_item_id);
CREATE INDEX idx_plaid_items_household_institution ON plaid_items(household_id, plaid_institution_id);
CREATE INDEX idx_merchants_household_name ON merchants(household_id, name);
```

Note: The existing `idx_txn_plaid_id` (non-unique) should be replaced by the new UNIQUE partial index above.

## Environment Variables

No new env vars required. Existing:
- `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` — already configured
- `ENCRYPTION_KEY` — for access token decrypt
- `PLAID_SYNC_MODE` — `poll` (default) or `webhook` (Phase 5)

## Phase 4 Interface Contract

Phase 3 guarantees for Phase 4:

1. Transactions in DB with `household_id` populated (scopedQuery works)
2. `merchant_id` populated where Plaid provides merchant info
3. `category_id = null` on all synced transactions (categorization is Phase 4)
4. `reviewed = false` on all synced transactions
5. Soft-delete via `deleted_at`, not hard delete
6. `plaid_transaction_id` has UNIQUE constraint for safe upserts
