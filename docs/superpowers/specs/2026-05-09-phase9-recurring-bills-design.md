# Phase 9 — Recurring Transactions + Bills

## Overview

Detect recurring transactions via Plaid's `/transactions/recurring/get` API, store them locally, and present them as a bills list page plus a dashboard widget. Read-only — no manual CRUD. Transaction back-linking connects individual transactions to their parent recurring stream.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Detection source | Plaid API only | Simpler, leverages Plaid's ML. No local pattern matching. |
| UI view | List view only | Calendar is high effort, low value for a side project. |
| Manual CRUD | None (auto-only) | All data from Plaid. Can add manual creation later. |
| Dashboard widget | Yes | Placeholder already exists. Low effort to activate. |
| Transaction back-linking | Yes | FK column already exists. Plaid provides transaction IDs per stream. Single bulk UPDATE. |
| Scheduling | Chain after transaction sync (4h) | Recurring data depends on transactions being current. No separate cron. |

---

## Backend Architecture

### Plaid Recurring Sync — `src/lib/plaid/recurring.ts`

Single exported function:

```typescript
export async function syncRecurringTransactions(
  plaidItemId: string,
  householdId: string,
  db?: LedgrDb
): Promise<{ upserted: number; deactivated: number }>
```

**Data flow:**

1. Read `plaidItems` row, decrypt access token
2. Call Plaid `/transactions/recurring/get` with access token + account IDs
3. Validate response with `PlaidRecurringResponseSchema`
4. In a single DB transaction:
   - Map each inflow/outflow stream to a `recurring_transactions` row
   - Upsert by `plaidStreamId` (insert new, update amounts/dates/frequency on existing)
   - Deactivate rows whose `plaidStreamId` is absent from the response (`isActive = false`)
   - Back-link: bulk UPDATE `transactions.recurringTransactionId` using each stream's `transaction_ids`

**No pagination needed.** Plaid returns all streams in one response (typically <50 per user).

**Stream → Row mapping:**

| Plaid field | DB column | Transform |
|-------------|-----------|-----------|
| `stream_id` | `plaidStreamId` | Direct |
| `description` | `name` | Title-case trim |
| `merchant_name` | `merchantId` | Lookup/create merchant |
| `category` | `categoryId` | Match via category rules or merchant default |
| `average_amount.amount` | `averageAmount` | `plaidAmountToCents()` |
| `last_amount.amount` | `lastAmount` | `plaidAmountToCents()` |
| `frequency` | `frequency` | Map: WEEKLY→weekly, BIWEEKLY→biweekly, SEMI_MONTHLY→semimonthly, MONTHLY→monthly, ANNUALLY→yearly, UNKNOWN→null |
| `last_date` | `lastDate` | ISO date string |
| `predicted_next_date` | `nextDate` | ISO date string |
| `is_active` | `isActive` | Direct |
| stream in `inflow_streams` | `isIncome` | `true` for inflows, `false` for outflows |

### Zod Schema — `src/lib/plaid/schemas.ts`

Add `PlaidRecurringStreamSchema` and `PlaidRecurringResponseSchema`:

```typescript
const PlaidRecurringStreamSchema = z.object({
  stream_id: z.string(),
  account_id: z.string(),
  description: z.string(),
  merchant_name: z.string().nullable(),
  average_amount: z.object({ amount: z.number() }),
  last_amount: z.object({ amount: z.number() }),
  frequency: z.enum(["WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY", "ANNUALLY", "UNKNOWN"]),
  last_date: z.string(),
  predicted_next_date: z.string().nullable(),
  is_active: z.boolean(),
  transaction_ids: z.array(z.string()),
  category: z.array(z.string()).optional(),
  status: z.enum(["MATURE", "EARLY_DETECTION", "TOMBSTONED"]).optional(),
});

const PlaidRecurringResponseSchema = z.object({
  inflow_streams: z.array(PlaidRecurringStreamSchema),
  outflow_streams: z.array(PlaidRecurringStreamSchema),
  request_id: z.string().optional(),
});
```

### Queries — `src/queries/recurring.ts`

```typescript
export async function getUpcomingBills(
  householdId: string,
  opts?: { search?: string; limit?: number },
  db?: LedgrDb
): Promise<BillRow[]>
```

- Filters: `isActive = true`, `isIncome = false`
- Joins with merchants (for name) and categories (for icon/name)
- Ordered by `nextDate` ASC (nulls last)
- Optional search on name/merchant name
- Optional limit for dashboard widget (default: all)

```typescript
export async function getRecurringSummary(
  householdId: string,
  db?: LedgrDb
): Promise<{ monthlyIncome: number; monthlyExpenses: number }>
```

- Aggregates active recurring streams, normalized to monthly amounts
- Weekly × 4.33, biweekly × 2.17, semimonthly × 2, monthly × 1, yearly ÷ 12

### Actions — `src/actions/recurring.ts`

```typescript
"use server"

export async function refreshRecurring(db?: LedgrDb): Promise<
  { success: true; upserted: number; deactivated: number } | { error: string }
>
```

- Gets `householdId` via `getHouseholdId()`
- Fetches all active `plaidItems` for household
- Calls `syncRecurringTransactions()` per item
- Calls `revalidatePath("/bills")` and `revalidatePath("/")`

### Scheduler — `src/lib/jobs/scheduler.ts`

Modify the existing 4-hour transaction sync job. After each item's `syncInstitution()` completes successfully, chain:

```typescript
await syncRecurringTransactions(item.id, item.householdId, db);
```

No separate cron. Recurring detection depends on fresh transaction data.

---

## Frontend Architecture

### Component Hierarchy

#### Atoms

**Reuse:** `AmountDisplay`

**New:** `src/components/atoms/bill-status-indicator.tsx`

```typescript
type BillStatus = "overdue" | "due-soon" | "upcoming" | "inactive";

export function BillStatusIndicator({ status }: { status: BillStatus })
```

- `overdue`: red dot + "Overdue"
- `due-soon`: amber dot + "Due soon" (within 3 days)
- `upcoming`: default muted dot + "Upcoming"
- `inactive`: muted dot + "Inactive"

Status derived from `nextDate` relative to today. Pure display — status calculation happens in the query or a utility.

#### Molecules

**`src/components/molecules/bill-row.tsx`**

Grid row: `grid-cols-[1fr_auto_80px_80px_100px]`

| Column | Content | Component |
|--------|---------|-----------|
| Name | Merchant/stream name | Plain text, `font-medium` |
| Category | Category name + icon | Plain text, `text-muted-foreground` |
| Amount | Monthly amount | `AmountDisplay` |
| Frequency | Weekly/Monthly/etc | `Badge variant="outline"` |
| Next date | Relative date | `BillStatusIndicator` + date text |

Overdue rows: `border-l-2 border-l-destructive` left accent.

**`src/components/molecules/bill-empty-state.tsx`**

`CalendarX2` icon. Message: "No recurring bills detected yet. Connect an account and sync transactions — bills are identified automatically." Link to `/accounts`.

#### Organisms

**`src/components/organisms/bill-list.tsx`**

Server component. Column header row + maps `BillRow`. Sorted by `nextDate` ascending. No client interactivity needed.

**`src/components/organisms/widgets/upcoming-bills.tsx`**

Client component (for consistency with other widgets). Compact list: name + amount + relative date for next 5 bills. "View all" link at bottom. Handles empty state inline ("No upcoming bills").

### Pages

**`src/app/(dashboard)/bills/page.tsx`** — Server component

```typescript
export default async function BillsPage({ searchParams }) {
  const householdId = await getHouseholdId();
  const params = await searchParams;
  const bills = await getUpcomingBills(householdId, { search: params.q });
  const summary = await getRecurringSummary(householdId);

  return (
    // Header with title + summary (monthly recurring income/expenses)
    // Optional search input
    // BillList or BillEmptyState
  );
}
```

**`src/app/(dashboard)/bills/loading.tsx`** — Skeleton matching list layout
**`src/app/(dashboard)/bills/error.tsx`** — Error boundary with retry

### Dashboard Widget Activation

1. `registry.ts`: Remove `isPlaceholder: true` from "bills" widget config
2. `dashboard-grid.tsx`: Add `case "bills": return <UpcomingBillsWidget data={data.upcomingBills} />`
3. `src/queries/dashboard.ts`: Add `getUpcomingBills(householdId, { limit: 5 })` to dashboard data fetch
4. `DashboardData` type: Add `upcomingBills: BillRow[]`
5. Dashboard page `Promise.all`: Include upcoming bills query

### Navigation

Add to `SidebarNav` `NAV_ITEMS`:

```typescript
{ href: "/bills", label: "Bills", icon: Receipt }
```

Position after "Budgets" in the nav order.

---

## Testing Strategy

### Integration Tests — `tests/integration/recurring-sync.test.ts`

| # | Test | Validates |
|---|------|-----------|
| 1 | Upserts new recurring streams | Insert from Plaid response, verify DB rows match |
| 2 | Updates existing stream | Changed amount/date updates existing row by plaidStreamId |
| 3 | Deactivates missing streams | Stream absent from response → isActive = false |
| 4 | Back-links transactions | transactions.recurringTransactionId set for matching plaid_transaction_ids |
| 5 | Household isolation | Streams from household A not visible to household B |

### Query Tests — `tests/integration/recurring-queries.test.ts`

| # | Test | Validates |
|---|------|-----------|
| 6 | getUpcomingBills returns active outflows sorted by nextDate | Correct filtering and sort order |
| 7 | getUpcomingBills search filter | Filters by name substring |
| 8 | getRecurringSummary normalizes to monthly | Weekly × 4.33, yearly ÷ 12, etc. |

### Contract Test

- MSW mock handler in `tests/mocks/handlers.ts` for `POST /transactions/recurring/get`
- Zod schema validates mock response shape

### Skip

- No property tests (no complex math — just storing Plaid data)
- No E2E tests (read-only page, no interactions)
- No unit tests for transform (covered by integration)

**Total: ~8-10 tests**

---

## File Inventory

### New Files (~10)

| File | Type |
|------|------|
| `src/lib/plaid/recurring.ts` | Plaid recurring sync logic |
| `src/queries/recurring.ts` | Queries (upcoming bills, summary) |
| `src/actions/recurring.ts` | Manual refresh action |
| `src/components/atoms/bill-status-indicator.tsx` | Status dot + label |
| `src/components/molecules/bill-row.tsx` | Bill list row |
| `src/components/molecules/bill-empty-state.tsx` | Empty state CTA |
| `src/components/organisms/bill-list.tsx` | Bill list container |
| `src/components/organisms/widgets/upcoming-bills.tsx` | Dashboard widget |
| `src/app/(dashboard)/bills/page.tsx` | Bills page |
| `src/app/(dashboard)/bills/loading.tsx` | Loading skeleton |
| `src/app/(dashboard)/bills/error.tsx` | Error boundary |
| `tests/integration/recurring-sync.test.ts` | Sync integration tests |
| `tests/integration/recurring-queries.test.ts` | Query integration tests |

### Modified Files (~5)

| File | Change |
|------|--------|
| `src/lib/plaid/schemas.ts` | Add recurring response Zod schema |
| `src/lib/jobs/scheduler.ts` | Chain recurring sync after transaction sync |
| `src/components/organisms/widgets/registry.ts` | Activate bills widget |
| `src/components/organisms/dashboard-grid.tsx` | Render UpcomingBillsWidget |
| `src/queries/dashboard.ts` | Fetch upcoming bills for dashboard |
| `src/app/(dashboard)/page.tsx` | Include upcomingBills in data |
| `src/components/organisms/sidebar-nav.tsx` | Add Bills nav item |
| `tests/mocks/handlers.ts` | Add recurring endpoint mock |

### Total: ~13 new + ~8 modified = ~21 file touches
