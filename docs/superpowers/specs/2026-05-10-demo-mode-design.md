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

All server actions that perform mutations call `guardDemoMode()` at the top. If demo mode is active, the action short-circuits with an error message.

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

export async function guardDemoMode(): Promise<{ error: string } | null> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  if (isDemoMode(session.user.id)) {
    return { error: "Demo mode is read-only. Switch to your account to make changes." };
  }
  return null;
}
```

Existing error handling in forms displays the message. Button-triggered actions (sync, import) show a toast.

## Demo Data

### Accounts (5)

| Type | Name | Balance (cents) |
|------|------|----------------|
| checking | Main Checking | 420000 |
| savings | Emergency Fund | 1250000 |
| credit | Everyday Card | -180000 |
| investment | Brokerage | 4500000 |
| loan | Car Loan | -820000 |

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

**Categorization:** Mix of `categorySource` values — "rule" (60%), "pfc" (25%), "manual" (15%).

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
- Called at app startup from `src/db/index.ts`
- Idempotent: checks if demo household exists, skips if so
- Uses the fixed `DEMO_HOUSEHOLD_ID` UUID
- Seeds categories (via existing `seedDefaultCategories()`), then accounts, merchants, transactions, balance history, budgets, recurring, and investments

## Settings UI

A toggle card on the settings page:

```
┌─────────────────────────────────────────────┐
│ Demo Mode                                    │
│ View the app with sample data. Your real     │
│ data is untouched while demo mode is active. │
│                                              │
│ [Toggle: OFF]                                │
└─────────────────────────────────────────────┘
```

**No banner or indicator** elsewhere in the UI — keeps the interface clean for screenshots.

**Server action:** `toggleDemoMode()` flips `userSettings.demoMode`, then calls `revalidatePath("/")` to refresh all pages with the new household context.

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
| `src/actions/settings.ts` | Add `toggleDemoMode()` server action |
| `src/app/(dashboard)/settings/page.tsx` | Render `DemoModeToggle` component |
| `src/db/index.ts` | Call `seedDemoHousehold()` on startup (idempotent) |
| All mutation actions (~12 files) | Add `guardDemoMode()` check at top of each mutation |

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

- **User has no settings row yet:** `isDemoMode()` returns `false` (null-safe check).
- **Demo household missing (fresh DB):** `seedDemoHousehold()` runs at startup and creates it. If somehow missing at runtime, `getHouseholdId()` returns the demo UUID and queries return empty results (safe but degraded).
- **Concurrent toggle:** `revalidatePath("/")` ensures all server components re-render. React cache is per-request, so no stale reads.
- **Demo data freshness:** Relative dates mean the demo always looks current. No cron or refresh needed.
- **`toggleDemoMode()` itself is not write-guarded:** The settings action that toggles demo mode must remain writable even when demo mode is on (otherwise you can't turn it off).
