# Phase 3 — Transaction Sync Engine Design

**Date:** 2026-05-09
**Status:** Draft
**Depends on:** Phase 2 (Plaid Link + Token Exchange) ✅

## Overview

Phase 3 implements cursor-based transaction sync via Plaid's `transactions/sync` endpoint, a background job scheduler, and "Sync Now" UI controls. This is the core data pipeline — without it, there's nothing to display, categorize, or budget against.

## Architecture

### Sync Engine Pipeline

`syncInstitution(itemId, householdId, db)` orchestrates three pure steps:

```
1. fetchAllPages(plaidClient, accessToken, cursor)
   → Loops transactionsSync() until has_more=false
   → Returns: { added[], modified[], removed[], nextCursor, accounts[] }

2. processBatch(added, modified, householdId)
   → Converts Plaid floats → integer cents
   → Computes normalized_amount (-1 * amount)
   → Builds merchant upsert payloads (name normalization, raw_names tracking)
   → Detects pending→posted transitions via pending_transaction_id
   → Returns: { inserts[], upserts[], merchantUpserts[], pendingToRemove[] }

3. applyToDb(db, processed, itemId, newCursor)
   → Single db.transaction():
     - Upsert merchants → resolve merchant_id FKs
     - INSERT new transactions
     - UPSERT modified transactions by plaid_transaction_id
     - Soft-delete removed transactions (set deleted_at)
     - Soft-delete pending rows replaced by posted versions
     - Update account balances from Plaid response
     - Update plaid_items.sync_cursor
     - INSERT sync_log entry
```

**Key invariant:** Cursor update and record writes are atomic in a single SQLite transaction. A crash mid-sync loses no data — the next sync resumes from the last committed cursor.

### Return Value

```typescript
type SyncResult =
  | { success: true; addedCount: number; modifiedCount: number; removedCount: number; syncedAt: string }
  | { success: false; error: string }
```

## Amount Handling

| Field | Convention | Example ($12.50 debit) |
|-------|-----------|----------------------|
| Plaid raw | Float, positive = debit | `12.50` |
| `amount` | Integer cents, Plaid convention | `1250` |
| `normalized_amount` | Integer cents, flipped sign | `-1250` |

- Conversion: `Math.round(plaidAmount * 100)`
- Normalization: `normalized_amount = -1 * amount`
- **-0 guard:** When amount is 0, use `Math.abs()` to avoid `-0` in comparisons

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

// Sync all institutions for household
export async function triggerSyncAll(): Promise<{ results: Record<string, SyncResult> }> {
  const householdId = await getHouseholdId();
  // Fetch all active plaid_items for householdId
  // Sequential sync: SQLite is single-writer, so syncing items one at a time
  // avoids WAL contention. Each item's Plaid API call + DB write completes
  // before the next starts.
  // revalidatePath("/accounts")
  // Return per-item results
}
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

- State: `useState<Map<string, SyncStatus>>` keyed by plaidItemId
- Sync All: ghost button in header, calls `triggerSyncAll()` server action (sequential server-side). While awaiting, all institutions show syncing state. Results update each badge independently on completion.
- `revalidatePath` in server action refreshes balances automatically

## File Structure

### New Files

```
src/lib/plaid/sync.ts              — syncInstitution, fetchAllPages, processBatch, applyToDb
src/lib/plaid/sync.test.ts         — colocated unit + property tests
src/lib/plaid/schemas.ts           — Zod schemas for Plaid sync response validation
src/lib/jobs/scheduler.ts          — node-cron setup
src/actions/sync.ts                — triggerSync, triggerSyncAll server actions
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

5 behavioral tests:

1. **Multi-page pagination drains all pages** — all txns inserted, cursor = "final"
2. **Removed transactions are soft-deleted** — `deleted_at IS NOT NULL`
3. **Modified transactions upsert without duplicates** — row count stays 1, amount updated
4. **Pending→posted transition** — pending row soft-deleted, posted row inserted
5. **Cursor atomicity** — cursor unchanged if write fails mid-transaction

### Colocated Unit Tests (`src/lib/plaid/sync.test.ts`)

- `processBatch` — cents conversion, normalized_amount, merchant payload shape
- Amount edge cases: zero (-0 guard), large amounts, negative credits

### Property Test

```typescript
test.prop([fc.float({ min: -99999.99, max: 99999.99, noNaN: true })])(
  "plaidAmountToCents round-trips without float drift",
  (amount) => { ... }
)
```

### Zod Contract Schemas (`src/lib/plaid/schemas.ts`)

Validate MSW fixture objects against Plaid response shapes. Catches SDK drift. Schemas for: sync response envelope, transaction object, removed notification.

### No E2E for Phase 3

Sync is server-side. The "Sync Now" button will be implicitly tested when Phase 4 adds transaction list E2E.

## Missing Indexes (Add in Migration)

```sql
CREATE INDEX idx_sync_log_plaid_item_id ON sync_log(plaid_item_id);
CREATE INDEX idx_plaid_items_household_institution ON plaid_items(household_id, plaid_institution_id);
```

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
6. `plaid_transaction_id` indexed for upserts
