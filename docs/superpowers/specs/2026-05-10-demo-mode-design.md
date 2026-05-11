# Demo Mode Design Spec

## Overview

Demo mode lets authenticated users switch to a shared, read-only demo household to view the app with realistic sample data. Primary use case: showcasing Ledgr's capabilities before installation and taking screenshots.

## Core Mechanism

A well-known demo household (fixed UUID `00000000-0000-0000-0000-000000000000`) is seeded at app startup. When a user enables demo mode via settings, `getHouseholdId()` returns the demo household ID instead of their real one. All existing `scopedQuery()` calls automatically serve demo data with zero changes to queries or page components.

### Household Switch

`src/lib/auth/session.ts` — modified `getHouseholdId()`:

```ts
export const getHouseholdId = cache(async (): Promise<string> => {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");

  if (isDemoMode(session.user.id)) {
    return DEMO_HOUSEHOLD_ID;
  }

  return resolveHouseholdId(session.user.id);
});
```

### Demo Mode State

`userSettings.demoMode` — integer column (boolean), default `0`. Read by `isDemoMode(userId)`, which is a **synchronous** function (direct better-sqlite3 query) — consistent with `resolveHouseholdId()` and other DB reads in this codebase.

## Write Guard

All server actions and API routes that perform mutations call `guardDemoMode()` at the top. If demo mode is active, the action short-circuits with an error message.

### Design

`guardDemoMode(userId)` accepts the already-resolved `userId` — the action resolves the session once, passes `userId` in. This makes the guard synchronous, testable, and avoids redundant session resolution.

```ts
// src/lib/demo-mode.ts
export const DEMO_HOUSEHOLD_ID = "00000000-0000-0000-0000-000000000000";

export function isDemoMode(userId: string): boolean {
  const settings = db
    .select({ demoMode: userSettings.demoMode })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();
  return settings?.demoMode === 1;
}

export function guardDemoMode(userId: string): { error: string } | null {
  if (isDemoMode(userId)) {
    return { error: "Demo mode is read-only. Switch to your account to make changes." };
  }
  return null;
}
```

### Usage Pattern

```ts
export async function updateBudget(input) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  const blocked = guardDemoMode(session.user.id);
  if (blocked) return blocked;

  // ... existing logic
}
```

### Guarded Files (exhaustive)

**Server actions (`src/actions/`):**
- `accounts.ts` — all mutations
- `budgets.ts` — all mutations
- `investments.ts` — all mutations
- `plaid.ts` — `createLinkToken`, `exchangePublicToken`, `disconnectPlaidItem`
- `reauth.ts` — all mutations
- `reports.ts` — all mutations
- `settings.ts` — all mutations EXCEPT `toggleDemoMode()`
- `sync.ts` — `triggerSync`
- `transaction-detail.ts` — all mutations
- `transactions.ts` — all mutations
- `mcp-settings.ts` — all mutations
- `dashboard.ts` — layout save

**API routes (`src/app/api/`):**
- `import/route.ts` — file import handler
- `ai/chat/route.ts` — AI chat (uses `resolveHouseholdId()` directly — must add guard)
- `plaid/webhook/route.ts` — see Webhook Safety section below

### Webhook Safety

Plaid webhooks have no session context — they arrive with an `item_id`. The demo household guard cannot use `guardDemoMode(userId)` here. Instead, the webhook handler checks the resolved household after `findItemByPlaidId()`:

```ts
// In webhook-handlers.ts, after resolving the item:
if (item.householdId === DEMO_HOUSEHOLD_ID) return;
```

This prevents any external webhook from mutating demo data.

### API Routes Using `resolveHouseholdId()` Directly

These routes bypass `getHouseholdId()` and call `resolveHouseholdId(session.user.id)` directly — they will NOT automatically pick up demo mode from the household switch. Each must explicitly check demo mode:

- `src/app/api/import/route.ts` — add `guardDemoMode(session.user.id)` before processing
- `src/app/api/ai/chat/route.ts` — add guard, AND use `getHouseholdId()` instead of `resolveHouseholdId()` so AI queries see demo data correctly

## Background Jobs & Scheduler

The scheduler (`src/lib/jobs/scheduler.ts`) runs without session context and processes all records. It must explicitly exclude the demo household:

### Required Exclusions

1. **`snapshotBalances()`** — add `ne(accounts.householdId, DEMO_HOUSEHOLD_ID)` to the query filter
2. **Transaction sync job** — add `ne(plaidItems.householdId, DEMO_HOUSEHOLD_ID)` when selecting items to sync
3. **`syncRecurringTransactions()`** — same exclusion
4. **`syncInvestments()` / `snapshotHoldings()`** — same exclusion

This prevents the scheduler from attempting to decrypt fake access tokens or appending live balance snapshots to demo data.

## Demo Data

### Accounts (5)

| Type | Name | Balance (cents) |
|------|------|----------------|
| checking | Main Checking | 420000 |
| savings | Emergency Fund | 1250000 |
| credit | Everyday Card | -180000 |
| investment | Brokerage | 4500000 |
| loan | Car Loan | -820000 |

### Plaid Items (2)

Required for the accounts page to render institution headers, sync status, and "last synced" timestamps correctly.

| Institution | Accounts | Status | Notes |
|-------------|----------|--------|-------|
| Chase | Checking, Savings, Credit | `good` | `plaidItemId: "demo-item-chase-0001"` |
| Vanguard | Brokerage | `good` | `plaidItemId: "demo-item-vanguard-0001"` |

- Car Loan is a manually-added account (no `plaidItemId`)
- Access tokens: encrypted placeholder string (e.g., `encrypt("demo-not-a-real-token")`)
- `lastSyncedAt`: relative (e.g., "2 hours ago" from seed time)
- IDs use `demo-item-*` prefix — clearly synthetic, cannot collide with real Plaid item IDs (`DPx...` pattern)

### Sync Log (4 entries)

2 entries per Plaid item showing recent successful syncs. Populates "Last synced" in the UI.

### Transactions (~400, spanning 6 months)

**Recurring:**
- Salary: $5,500 bi-weekly (income)
- Rent: $1,800/month
- Subscriptions: Netflix ($15.99), Spotify ($10.99), gym ($45)
- Utilities: electric (~$85-120), internet ($79.99), phone ($55)
- Car loan payment: $385/month

**Variable:**
- Groceries: 2-3x/week, $30-120 (Whole Foods, Trader Joe's, Safeway)
- Restaurants: 3-5x/month, $15-80
- Gas: 2x/month, $40-65
- Shopping: Amazon, Target — sporadic
- Coffee: 4-6x/month, $5-8

**Categorization:** Deterministic assignment by transaction index (modulo-based), not random. Distribution: `categorySource` — "rule" (60%), "pfc" (25%), "manual" (15%).

### Supporting Data

- **Balance history:** Daily snapshots for all accounts (180 days) — enables net worth chart
- **Budgets (3):** Food & Dining ($600), Shopping ($400), Entertainment ($200) — with current-month spend populated
- **Recurring transactions (6):** Rent, salary, Netflix, Spotify, gym, car payment — detected with `isActive: true`
- **Merchants (~20):** Realistic names with assigned categories
- **Investment holdings (3):** VTI (50 shares), AAPL (10 shares), BND (30 shares) with 6 months of daily price history

### Date Strategy

All dates are relative to `nowISO()` / `todayDateString()`. Transactions are generated as "today minus N days" so the demo always looks current regardless of when it's viewed.

### Seeding Strategy

`seedDemoHousehold()` in `src/db/seed/demo.ts`:
- Called at app startup from `src/app/layout.tsx` (root server layout, runs after migrations are applied — NOT from `db/index.ts` which runs at module load before migrations)
- Idempotent: checks if demo household row exists FIRST — if it exists, returns immediately before any inserts. This is an atomic early-return, not a per-row check.
- Uses the fixed `DEMO_HOUSEHOLD_ID` UUID
- Seeds in order: household → categories (via `seedDefaultCategories()`) → plaid items → accounts → merchants → transactions → balance history → budgets → recurring → investments → sync log

## Settings UI

A toggle card on the settings page — **first card, above AI and MCP settings** (since it affects the entire app experience):

```
┌─────────────────────────────────────────────┐
│ Demo Mode                                    │
│ Browse the app with sample financial data.   │
│ Your real data is untouched while active.    │
│                                              │
│ [Toggle: OFF]                                │
└─────────────────────────────────────────────┘
```

**No banner or indicator** elsewhere in the UI — keeps the interface clean for screenshots.

**Note:** The sidebar will continue to show the authenticated user's real name/email while demo data is displayed. This is intentional — demo mode switches the data context, not the user identity.

**Server action:** `toggleDemoMode()` uses an **upsert** pattern (consistent with `upsertAiSettings`) to handle users who may not have a `userSettings` row yet. After the write, calls `revalidatePath("/", "layout")` to invalidate the root layout and all nested routes.

**Component:** `src/components/molecules/demo-mode-toggle.tsx` — client component using the established `Card + Switch` pattern from MCP settings. Uses `useTransition` for pending state.

## Files

### New Files

| File | Purpose |
|------|---------|
| `src/lib/demo-mode.ts` | `DEMO_HOUSEHOLD_ID`, `isDemoMode()`, `guardDemoMode()` |
| `src/db/seed/demo.ts` | `seedDemoHousehold()` — all demo data generation |
| `src/components/molecules/demo-mode-toggle.tsx` | Settings toggle card (client component) |

### Modified Files

| File | Change |
|------|--------|
| `src/db/schema/households.ts` | Add `demoMode` integer column to `userSettings` |
| `src/lib/auth/session.ts` | `getHouseholdId()` checks `isDemoMode()` before resolving |
| `src/actions/settings.ts` | Add `toggleDemoMode()` server action (upsert pattern) |
| `src/actions/accounts.ts` | Add `guardDemoMode()` |
| `src/actions/budgets.ts` | Add `guardDemoMode()` |
| `src/actions/investments.ts` | Add `guardDemoMode()` |
| `src/actions/plaid.ts` | Add `guardDemoMode()` to `createLinkToken`, `exchangePublicToken`, `disconnectPlaidItem` |
| `src/actions/reauth.ts` | Add `guardDemoMode()` |
| `src/actions/reports.ts` | Add `guardDemoMode()` |
| `src/actions/sync.ts` | Add `guardDemoMode()` to `triggerSync` |
| `src/actions/transaction-detail.ts` | Add `guardDemoMode()` |
| `src/actions/transactions.ts` | Add `guardDemoMode()` |
| `src/actions/mcp-settings.ts` | Add `guardDemoMode()` |
| `src/actions/dashboard.ts` | Add `guardDemoMode()` |
| `src/app/api/import/route.ts` | Add `guardDemoMode()` before import processing |
| `src/app/api/ai/chat/route.ts` | Add guard + switch to `getHouseholdId()` |
| `src/lib/plaid/webhook-handlers.ts` | Add demo household check after `findItemByPlaidId()` |
| `src/lib/jobs/scheduler.ts` | Exclude `DEMO_HOUSEHOLD_ID` from all job queries |
| `src/app/(dashboard)/settings/page.tsx` | Render `DemoModeToggle` component (first position) |
| `src/app/layout.tsx` | Call `seedDemoHousehold()` (idempotent, once at startup) |

### Unchanged

- All query functions — `scopedQuery` handles the switch transparently
- All page components — render whatever household data they receive
- Dashboard layout — no banner or demo indicators

## Migration

Single column addition:

```sql
ALTER TABLE user_settings ADD COLUMN demo_mode INTEGER NOT NULL DEFAULT 0;
```

## Edge Cases

- **User has no settings row yet:** `isDemoMode()` returns `false` (null-safe). `toggleDemoMode()` uses upsert to create the row.
- **Demo household missing (fresh DB):** `seedDemoHousehold()` runs at startup and creates it. If somehow missing at runtime, `getHouseholdId()` returns the demo UUID and queries return empty results (safe but degraded).
- **Concurrent toggle:** `revalidatePath("/", "layout")` ensures all server components under the root layout re-render. React cache is per-request, so no stale reads.
- **Demo data freshness:** Relative dates mean the demo always looks current. No cron or refresh needed.
- **`toggleDemoMode()` itself is not write-guarded:** The settings action that toggles demo mode must remain writable even when demo mode is on (otherwise you can't turn it off).
- **`toggleDemoMode()` does not call `getHouseholdId()` internally:** It only reads `getSession()` to get the user ID, avoiding stale cache reads within the toggle request.
- **Sidebar identity:** Shows the real authenticated user's name/email even in demo mode. This is intentional.
- **Scheduler exclusion:** Demo household is excluded from all background jobs to prevent fake token decryption errors and unbounded data growth.
