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
  accessToken: string,
  db?: LedgrDb
): Promise<{ upserted: number; deactivated: number }>
```

Accepts a pre-decrypted `accessToken` from the caller to avoid double-decrypting (the transaction sync already decrypts it). Non-fatal — errors are logged but do not propagate to the caller or affect item status.

**Data flow:**

1. Call Plaid `/transactions/recurring/get` with access token + account IDs
2. Validate response with `PlaidRecurringResponseSchema`
3. In a single DB transaction:
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
| `frequency` | `frequency` | Map: WEEKLY→weekly, BIWEEKLY→biweekly, SEMI_MONTHLY→semimonthly, MONTHLY→monthly, ANNUALLY→yearly, UNKNOWN→null. Node SDK method: `transactionsRecurringGet()` |
| `last_date` | `lastDate` | ISO date string |
| `predicted_next_date` | `nextDate` | ISO date string |
| `is_active` | `isActive` | Direct |
| `account_id` | `accountId` | FK to accounts table (looked up by plaidAccountId) |
| `first_date` | — | Not stored (available from Plaid but not needed in DB) |
| stream in `inflow_streams` | `isIncome` | `true` for inflows, `false` for outflows |

**Error handling:** Non-fatal, like categorization. On Plaid API failure, log the error with `console.error` and return `{ upserted: 0, deactivated: 0 }`. Do not update item status or write to `syncLog` — recurring is supplementary data, not core sync.

### Zod Schema — `src/lib/plaid/schemas.ts`

Add `PlaidRecurringStreamSchema` and `PlaidRecurringResponseSchema`:

```typescript
const PlaidStreamAmountSchema = z.object({
  amount: z.number().nullable(),
  iso_currency_code: z.string().nullable(),
  unofficial_currency_code: z.string().nullable().optional(),
});

const PlaidRecurringStreamSchema = z.object({
  stream_id: z.string(),
  account_id: z.string(),
  description: z.string(),
  merchant_name: z.string().nullable(),
  first_date: z.string(),
  last_date: z.string(),
  predicted_next_date: z.string().nullable(),
  average_amount: PlaidStreamAmountSchema,
  last_amount: PlaidStreamAmountSchema,
  frequency: z.enum(["WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY", "ANNUALLY", "UNKNOWN"]),
  is_active: z.boolean(),
  transaction_ids: z.array(z.string()),
  personal_finance_category: z.object({
    primary: z.string(),
    detailed: z.string(),
    confidence_level: z.string().nullable().optional(),
  }).nullable().optional(),
  category: z.array(z.string()).optional(),
  status: z.enum(["MATURE", "EARLY_DETECTION", "TOMBSTONED", "UNKNOWN"]).optional(),
}).passthrough();

const PlaidRecurringResponseSchema = z.object({
  inflow_streams: z.array(PlaidRecurringStreamSchema),
  outflow_streams: z.array(PlaidRecurringStreamSchema),
  request_id: z.string(),
});
```

Uses `.passthrough()` on the stream schema to tolerate additional fields Plaid may add. `request_id` is required (Plaid always returns it). `first_date` and `personal_finance_category` captured. Amount objects include currency fields. Frequency enum matches official Plaid docs (no DAILY — not in current API).

**Sandbox note:** Plaid sandbox returns canned fixture data for `/transactions/recurring/get` that does not reflect actual test transactions. Development testing relies on MSW mocks for realistic scenarios.

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
- Use exact fractions as constants: weekly × `52/12`, biweekly × `26/12`, semimonthly × 2, monthly × 1, yearly × `1/12`

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

Modify the existing 4-hour transaction sync job. After each item's `syncInstitution()` completes, check the result before chaining:

```typescript
const result = await syncInstitution(item.id, item.householdId, db);
if (result.success) {
  const accessToken = decrypt(item.accessToken);
  await syncRecurringTransactions(item.id, item.householdId, accessToken, db);
}
```

Guard: only sync recurring if transaction sync succeeded. Pass the already-decrypted access token to avoid double-decrypt. No separate cron — recurring detection depends on fresh transaction data.

### Schema Migration

Add to `recurring_transactions` table via a new Drizzle migration:

1. **Unique index on `plaidStreamId`** — required for upsert-by-stream-id strategy: `uniqueIndex("idx_recurring_plaid_stream_id").on(table.plaidStreamId)`
2. **`accountId` column** — FK to `accounts` table. Needed to show which account a recurring charge hits: `accountId: text("account_id").references(() => accounts.id)`
3. **Add `.references()` to `transactions.recurringTransactionId`** — referential integrity for the back-link FK

**Note on `stream_id`:** The Plaid docs do not explicitly list `stream_id` in the TransactionStream object fields, but it is present in the OpenAPI spec and Node SDK types. Verify during implementation by inspecting the actual API response in sandbox. If absent, fall back to a composite key of `(account_id, merchant_name, frequency)` for upsert deduplication.

---

## Frontend Architecture

### Component Hierarchy

#### Atoms

**Reuse:** `AmountDisplay`

**New:** `src/components/atoms/bill-status-indicator.tsx`

Composes the existing `StatusBadge` pattern (colored dot + label) rather than duplicating it. Same visual language, bill-specific statuses:

```typescript
type BillStatus = "overdue" | "due-soon" | "upcoming" | "inactive";

export function BillStatusIndicator({ status }: { status: BillStatus })
```

- `overdue`: red dot + "Overdue"
- `due-soon`: amber dot + "Due soon" (within 3 days)
- `upcoming`: default muted dot + "Upcoming"
- `inactive`: muted dot + "Inactive"

Status derived from `nextDate` relative to today via a `deriveBillStatus(nextDate: string | null, isActive: boolean): BillStatus` utility in `src/lib/date-utils.ts`. Pure display.

#### Molecules

**`src/components/molecules/bill-row.tsx`**

Grid row with explicit pixel widths (matching TransactionRow convention): `grid-cols-[1fr_140px_100px_100px_120px]`

| Column | Width | Content | Component |
|--------|-------|---------|-----------|
| Name | `1fr` | Merchant/stream name | Plain text, `font-medium` |
| Category | `140px` | Category name + icon | Plain text, `text-muted-foreground` |
| Amount | `100px` | Monthly amount (always positive for bills) | `AmountDisplay` with `Math.abs()` |
| Frequency | `100px` | Weekly/Monthly/etc | `Badge variant="outline"` |
| Status + date | `120px` | Relative date | `BillStatusIndicator` + date text |

Overdue rows: `border-l-2 border-l-destructive` left accent.

**Amount sign convention:** Bill amounts are stored as positive integers (expenses). The query ensures amounts are `Math.abs()` before returning to avoid `AmountDisplay` showing "+" prefix on income-convention amounts from Plaid.

**`src/components/molecules/bill-empty-state.tsx`**

`CalendarX2` icon. Message: "No recurring bills detected yet. Connect an account and sync transactions — bills are identified automatically." Link to `/accounts`.

#### Organisms

**`src/components/organisms/bill-list.tsx`**

Server component. Column header row + maps `BillRow`. Sorted by `nextDate` ascending. Receives pre-fetched `bills` array as props — no client state.

**`src/components/molecules/bill-search.tsx`**

Client component (`"use client"`). Search input with debounced URL param update (same pattern as `TransactionFilters` search). Updates `?q=` param via `useRouter().push()`. This is the only client-side interactivity on the bills page — separated into its own molecule to keep `BillList` as a server component.

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

1. `registry.ts`: Remove `isPlaceholder: true` and `placeholderText` from "bills" widget config. Update `getDefaultLayout()` to include the bills widget position in desktop/tablet/mobile layouts.
2. `dashboard-grid.tsx`: Add `upcomingBills: BillRow[]` to `DashboardData` interface. Add `case "bills": return <UpcomingBillsWidget data={data.upcomingBills} />` to `renderWidget()`.
3. `src/queries/dashboard.ts`: Add `getUpcomingBills(householdId, { limit: 5 })` call.
4. `src/app/(dashboard)/page.tsx`: Include upcoming bills in the `Promise.all` data fetch. Pass to `DashboardGridLoader` via the `data` prop.

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
| 8 | getRecurringSummary normalizes to monthly | Weekly × 52/12, yearly × 1/12, etc. |

### Error Path Tests — `tests/integration/recurring-sync.test.ts`

| # | Test | Validates |
|---|------|-----------|
| 9 | Plaid API returns error | Non-fatal: logs error, returns `{ upserted: 0, deactivated: 0 }`, no item status change |
| 10 | Zod validation fails on malformed response | Non-fatal: same as above |

### Contract Test

- MSW mock handler in `tests/mocks/handlers.ts` for `POST /transactions/recurring/get`
- Zod schema validates mock response shape

### Test Helpers — `tests/integration/helpers.ts`

Add to existing shared helpers:

- `insertPlaidItem(db, overrides?)` — creates a plaid_items row with encrypted access token (extract from inline setup in `transaction-sync.test.ts` to reduce duplication)
- `insertRecurringTransaction(db, overrides?)` — creates a recurring_transactions row for query tests

### Skip

- No property tests (no complex math — just storing Plaid data)
- No E2E tests (read-only page, no interactions)
- No unit tests for transform (covered by integration)

**Total: ~10-12 tests**

---

## File Inventory

### New Files (~12)

| File | Type |
|------|------|
| `src/lib/plaid/recurring.ts` | Plaid recurring sync logic |
| `src/queries/recurring.ts` | Queries (upcoming bills, summary) |
| `src/actions/recurring.ts` | Manual refresh action |
| `src/components/atoms/bill-status-indicator.tsx` | Status dot + label (composes StatusBadge pattern) |
| `src/components/molecules/bill-row.tsx` | Bill list row |
| `src/components/molecules/bill-search.tsx` | Client-side search input with URL param update |
| `src/components/molecules/bill-empty-state.tsx` | Empty state CTA |
| `src/components/organisms/bill-list.tsx` | Bill list container (server component) |
| `src/components/organisms/widgets/upcoming-bills.tsx` | Dashboard widget |
| `src/app/(dashboard)/bills/page.tsx` | Bills page |
| `src/app/(dashboard)/bills/loading.tsx` | Loading skeleton |
| `src/app/(dashboard)/bills/error.tsx` | Error boundary |
| `tests/integration/recurring-sync.test.ts` | Sync + error path integration tests |
| `tests/integration/recurring-queries.test.ts` | Query integration tests |

### Modified Files (~9)

| File | Change |
|------|--------|
| `src/db/schema/recurring.ts` | Add unique index on plaidStreamId, add accountId column |
| `src/db/schema/transactions.ts` | Add .references() to recurringTransactionId FK |
| `src/lib/plaid/schemas.ts` | Add recurring response Zod schemas |
| `src/lib/date-utils.ts` | Add `deriveBillStatus()` utility |
| `src/lib/jobs/scheduler.ts` | Chain recurring sync after transaction sync (with guard) |
| `src/components/organisms/widgets/registry.ts` | Activate bills widget + update default layout |
| `src/components/organisms/dashboard-grid.tsx` | Add upcomingBills to DashboardData, render widget |
| `src/queries/dashboard.ts` | Fetch upcoming bills for dashboard |
| `src/app/(dashboard)/page.tsx` | Include upcomingBills in Promise.all |
| `src/components/organisms/sidebar-nav.tsx` | Add Bills nav item |
| `tests/mocks/handlers.ts` | Add recurring endpoint mock |
| `tests/integration/helpers.ts` | Add insertPlaidItem + insertRecurringTransaction helpers |

### Total: ~14 new + ~12 modified = ~26 file touches
