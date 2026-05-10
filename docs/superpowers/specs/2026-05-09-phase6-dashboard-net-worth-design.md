# Phase 6 — Dashboard + Net Worth Design Spec

## Overview

Transform the dashboard stub into a fully functional financial overview with drag-and-drop widget customization. Core widgets: net worth history chart, spending by category (donut + bar views), monthly cash flow, recent transactions, account balances, and dashboard summary cards. Placeholder widgets for future phases (budgets, bills, goals).

## Architecture: Widget Registry + Composition

Each dashboard widget is an independent organism. A widget registry (typed config array with direct component references) drives both the drag-and-drop grid and rendering. The dashboard page is a thin server component that fetches all data upfront via `Promise.all` and passes typed slices to a `DashboardGrid` client organism.

All widgets are client components — the `DashboardGrid` is a `"use client"` boundary, and any component rendered inside it is automatically client-rendered regardless of whether it has its own `"use client"` directive.

```
DashboardPage (server — fetches all data via Promise.all)
  └── DashboardGrid (client, react-grid-layout, dynamic import with ssr: false)
        ├── NetWorthChart (client, Recharts ComposedChart)
        ├── SpendingByCategory (client, Recharts PieChart/BarChart)
        ├── CashFlowChart (client, Recharts BarChart)
        ├── RecentTransactionsWidget (client)
        ├── AccountBalancesWidget (client)
        ├── DashboardSummaryCards (client)
        └── WidgetPlaceholder × 3 (budget, bills, goals)
```

**SSR constraint:** `react-grid-layout` uses `window` and DOM measurement APIs. `DashboardGrid` must be dynamically imported with `{ ssr: false }` from the dashboard page to prevent SSR crashes:

```typescript
const DashboardGrid = dynamic(() => import("@/components/organisms/dashboard-grid"), { ssr: false });
```

---

## Data Layer

### Aggregate Data Type

All dashboard data flows through an explicit typed interface:

```typescript
interface DashboardData {
  summary: DashboardSummary;
  netWorthHistory: NetWorthPoint[];
  monthlySpending: SpendingRow[];
  cashFlow: CashFlowRow[];
  recentTransactions: TransactionRow[];
  accounts: InstitutionGroup[];
}
```

`DashboardGrid` receives this typed object and passes each slice to the corresponding widget — e.g., `data.netWorthHistory` to `NetWorthChart`, `data.monthlySpending` to `SpendingByCategory`. Each widget's props are typed to accept only their slice, not the full `DashboardData`.

### Queries — `src/queries/dashboard.ts`

All functions follow the existing `scopedQuery(householdId, db)` pattern with optional `db` parameter for testability.

#### `getDashboardSummary(householdId, db?)`

Returns `{ netWorth: number, monthlyIncome: number, monthlyExpenses: number, monthlyNet: number }`.

- Net worth reuses `classifyAccountType` from `src/lib/account-utils.ts`.
- Monthly figures sum `normalizedAmount` on current-month transactions, splitting income (negative normalizedAmount) from expenses (positive normalizedAmount).

#### `getNetWorthHistory(householdId, range, db?)`

Returns `{ date: string, assets: number, liabilities: number, netWorth: number }[]`.

- `range`: `"1M" | "3M" | "6M" | "1Y" | "all"` — converted to a `dateFrom` filter.
- Aggregates `balance_history` rows by date, joining with `accounts` to classify each as asset or liability via `classifyAccountType`.
- Groups by date: `assets = sum(balance WHERE type IN asset_types)`, `liabilities = sum(balance WHERE type IN liability_types)`, `netWorth = assets - liabilities`.
- Excludes hidden and deleted accounts.
- **Synthetic "today" point:** Always appends a final data point for today's date using live `accounts.currentBalance` (same logic as `getDashboardSummary`). This prevents divergence between the summary cards and the chart's rightmost value.

#### `getMonthlySpending(householdId, month?, db?)`

Returns `{ categoryId: string | null, categoryName: string, categoryIcon: string, groupName: string, total: number }[]`.

- Defaults to current month if `month` not provided.
- Sums `normalizedAmount` on expense transactions (positive normalizedAmount) grouped by category.
- Joins categories + categoryGroups for display names.
- Uncategorized transactions grouped under a synthetic "Uncategorized" entry.
- Sorted by total descending.

#### `getCashFlow(householdId, months?, db?)`

Returns `{ month: string, income: number, expenses: number, net: number }[]`.

- `months` defaults to 6.
- Groups transactions by month (YYYY-MM from date column).
- Income = sum of transactions with negative `normalizedAmount` (flipped to positive for display).
- Expenses = sum of transactions with positive `normalizedAmount`.
- Net = income - expenses.

#### `getRecentTransactions(householdId, limit?, db?)`

Returns `TransactionRow[]` (same shape as existing `getTransactions` return type).

- Calls `baseTransactionQuery()` — a shared helper extracted from `src/queries/transactions.ts` that builds the 4-table LEFT JOIN (accounts, merchants, categories, categoryGroups). Both `getTransactions` and `getRecentTransactions` use this base.
- No filters, fixed limit (default 5), ordered by date desc + id desc.
- No cursor pagination.

### Interactive Data Fetching — URL Search Params (Not Server Actions)

Widget interactions that need fresh data (date range changes, month navigation) use **URL search params**, not server actions. This follows the project's architectural rule: "Server Actions = mutations."

- `DateRangeSelector` updates `?nwRange=3M` in the URL.
- `SpendingByCategory` month navigation updates `?spendMonth=2026-04`.
- The dashboard server component reads these params and fetches the appropriate data slice.
- Next.js App Router handles the re-render via RSC streaming — only the changed data is refetched.

This is consistent with how `TransactionFilters` already works (URL-driven filters via `searchParams`).

### Server Actions — `src/actions/dashboard.ts`

Only mutation actions — no read-only data fetching:

#### `saveDashboardLayout(layout)`

- Validates layout with Zod schema (including safe-parse for corrupted JSON from stale persisted layouts).
- Upserts `user_settings` row for current user with `dashboard_layout` JSON.
- Persists **per-breakpoint layouts** (desktop 4-col, tablet 2-col, mobile 1-col) as separate keys in the JSON.
- No `revalidatePath` needed (client state already updated optimistically).

---

## Balance Snapshot Job

### Daily Snapshot — `src/lib/jobs/scheduler.ts`

New cron job: `"0 0 * * *"` (midnight daily).

```
For each account WHERE deletedAt IS NULL AND isHidden = false:
  INSERT INTO balance_history (id, accountId, date, balance)
  VALUES (uuid, accountId, todayDateString(), currentBalance)
  ON CONFLICT (accountId, date) DO NOTHING
```

Skips accounts where `currentBalance IS NULL`. Idempotent — safe to run multiple times per day.

Uses Drizzle's `onConflictDoNothing` targeting the `(accountId, date)` column pair explicitly (not relying on implicit index conflict detection).

### Sync-Time Balance Recording — `src/lib/plaid/sync.ts`

**Current gap:** `accountBalances` is never passed to `applyToDb` — the parameter defaults to `[]`, so balance updates during sync are a no-op.

**Fix:** After `fetchAllPages` completes, call Plaid's `/accounts/balance/get` endpoint with `min_last_updated_datetime` set to 15 minutes ago to force fresh balance retrieval. Pass these fresh balances to `applyToDb`.

```typescript
// In syncInstitution, after fetchAllPages:
const balanceResponse = await client.accountsBalanceGet({
  access_token: accessToken,
  options: { min_last_updated_datetime: new Date(Date.now() - 15 * 60 * 1000).toISOString() },
});
const freshBalances = balanceResponse.data.accounts.map(/* ... */);

// Pass to applyToDb as the 6th argument
const counts = await applyToDb(db, processed, itemId, householdId, fetchResult.nextCursor, freshBalances);
```

Inside `applyToDb`, **after** the main transaction completes successfully (not inside it — a balance_history write failure should not roll back a successful sync), insert today's balance_history entries:

```
INSERT INTO balance_history (id, accountId, date, balance)
VALUES (uuid, accountId, todayDateString(), currentBalance)
ON CONFLICT (accountId, date) DO UPDATE SET balance = excluded.balance
```

Uses Drizzle's `onConflictDoUpdate` targeting the `(accountId, date)` column pair explicitly.

### Backfill — `src/lib/jobs/backfill-balances.ts`

Reconstructs **approximate** historical balances by walking transactions backward from `currentBalance`. Results are estimates — the spec acknowledges this limitation (see Limitations section).

Algorithm:
1. For each non-deleted, non-hidden account with a `currentBalance`:
2. **Skip investment accounts** — investment transactions use a separate Plaid endpoint (`/investments/transactions/get`) and are not in the `transactions` table. Backfill would produce a meaningless flat line.
3. Get all **posted** transactions ordered by date desc: `WHERE pending = false AND deletedAt IS NULL`.
4. Starting from `currentBalance` on today's date, walk backward:
   - For each day with transactions, subtract the day's net `normalizedAmount` to get the previous day's balance.
   - Insert `balance_history` row for that date.
5. Skip dates that already have entries (non-destructive).
6. Stop at the account's `createdAt` date or the earliest transaction date.

**Trigger:** CLI-only via `pnpm db:backfill-balances`. Also triggered by the `TRANSACTIONS_INITIAL_UPDATE` webhook handler (Phase 5) when a newly connected institution's first historical batch is ready — this is the Plaid-idiomatic moment for backfill.

**Never triggered on page load.** The dashboard renders whatever `balance_history` rows exist. If the net worth chart has no data, it shows an empty state: "Net worth history will appear after your accounts sync."

### Limitations (documented for implementation)

- Backfill balances are approximations. Plaid's `currentBalance` is the real-time ledger balance (settled transactions) which may not match the sum of all synced transactions (due to intraday movements, adjustments, fees not captured as transactions).
- Investment accounts are excluded from backfill — they will show net worth data only from daily snapshots going forward.
- Credit card `currentBalance` represents amount owed (positive). The backfill math is correct: a purchase adds to the balance, a payment reduces it.
- For accounts where `currentBalance` is null (rare, but possible with some Plaid integrations), both backfill and daily snapshots skip the account.

---

## Widget Registry & Grid

### Registry — `src/components/organisms/widgets/registry.ts`

Uses direct component references (not strings) for type safety:

```typescript
import type { ComponentType } from "react";

type WidgetSize = { w: number; h: number };

type WidgetConfig = {
  id: string;
  title: string;
  defaultSize: WidgetSize;
  minSize?: WidgetSize;
  component: ComponentType<any>;
  placeholderText?: string;
};

const DASHBOARD_WIDGETS: WidgetConfig[] = [
  { id: "net-worth",    title: "Net Worth",            defaultSize: { w: 2, h: 2 }, component: NetWorthChart },
  { id: "accounts",     title: "Account Balances",     defaultSize: { w: 2, h: 1 }, component: AccountBalancesWidget },
  { id: "summary",      title: "Summary",              defaultSize: { w: 2, h: 1 }, component: DashboardSummaryCards },
  { id: "spending",     title: "Spending",              defaultSize: { w: 2, h: 2 }, component: SpendingByCategory },
  { id: "cash-flow",    title: "Cash Flow",             defaultSize: { w: 2, h: 1 }, component: CashFlowChart },
  { id: "recent-txns",  title: "Recent Transactions",   defaultSize: { w: 2, h: 2 }, component: RecentTransactionsWidget },
  { id: "budgets",      title: "Budget Progress",       defaultSize: { w: 2, h: 1 }, component: WidgetPlaceholder, placeholderText: "Coming in Phase 8" },
  { id: "bills",        title: "Upcoming Bills",        defaultSize: { w: 2, h: 1 }, component: WidgetPlaceholder, placeholderText: "Coming in Phase 10" },
  { id: "goals",        title: "Goals",                 defaultSize: { w: 2, h: 1 }, component: WidgetPlaceholder, placeholderText: "Coming in Phase 13" },
] as const;
```

TypeScript will catch any missing component import at compile time — no silent runtime failures.

### Default Layouts (per breakpoint)

**Desktop (4-column):**

| Row | Col 1-2 | Col 3-4 |
|-----|---------|---------|
| 1   | Net Worth Chart (2×2) | Account Balances (2×1) |
| 2   | (continued) | Summary Cards (2×1) |
| 3   | Spending by Category (2×2) | Cash Flow (2×1) |
| 4   | (continued) | Recent Transactions (2×2) |
| 5   | — | (continued) |

**Tablet (2-column):** Widgets stack in single column pairs — Net Worth (2×2), Summary (2×1), Account Balances (2×1), Spending (2×2), Cash Flow (2×1), Recent Transactions (2×2).

**Mobile (1-column):** All widgets full-width (1×h), stacked vertically. Drag-and-drop **disabled** (`isDraggable={false}`) — touch drag with react-grid-layout has known issues.

Placeholder widgets (budgets, bills, goals) are hidden by default but available in a widget picker to add to the grid.

Layout persistence stores **per-breakpoint layouts** in the `dashboardLayout` JSON column, keyed by breakpoint name (`{ desktop: [...], tablet: [...], mobile: [...] }`).

### DashboardGrid — `src/components/organisms/dashboard-grid.tsx`

- Client component using `react-grid-layout/Responsive` with `breakpoints` and `cols` props.
- **Must be dynamically imported** with `{ ssr: false }` from the dashboard page.
- Props: `layout: PerBreakpointLayout`, `data: DashboardData`, `onLayoutChange: (layout) => void`.
- Renders each widget by iterating the registry and passing the typed data slice as props.
- Each widget wrapped in a `Card` with title bar and drag handle (uses shadcn `CardHeader` + `CardContent`).
- Layout changes debounced (300ms) and saved via `saveDashboardLayout` server action.
- Responsive breakpoints: `{ lg: 1200, md: 768, sm: 0 }` with cols `{ lg: 4, md: 2, sm: 1 }`.

---

## Widget Components

### Atomic Design Hierarchy

**Atoms (new):**

- `DateRangeSelector` — stateless toggle group with preset buttons (1M, 3M, 6M, 1Y, All). Props: `value: string`, `onChange: (range) => void`. Uses shadcn `ToggleGroup`. Controlled, no internal state — consistent with existing atom patterns (like `BalanceDisplay`, `StatusBadge`).
- `ChartViewToggle` — stateless tab switcher (Donut / Bar). Props: `value: "donut" | "bar"`, `onChange`. Uses shadcn `Tabs`. Same reasoning — wraps a single shadcn primitive with no internal state.

**Molecules (new):**

- `WidgetPlaceholder` — "Coming soon" card with muted icon, title, and description text. Props: `title: string`, `description: string`.
- `SpendingCategoryRow` — category name + icon + amount + percentage bar. Props: `name, icon, amount, percentage, color`. Color is derived from a cycling palette based on sort position (not stored in DB).

**Existing molecule update:**

- `SummaryCard` — add optional `variant?: "default" | "positive" | "negative"` prop. `positive` applies `text-emerald-600` to the balance, `negative` applies `text-destructive`. Used by `DashboardSummaryCards` to color-code income (green) vs expenses (red) and net savings.

**Organisms (one per widget):**

#### `NetWorthChart` (client)
- Recharts `ComposedChart` (not `AreaChart` — avoids overlapping fill confusion): net worth as filled `Area` (blue), assets and liabilities as `Line` series (green/red).
- `DateRangeSelector` atom in the widget header.
- Range changes update URL search params (`?nwRange=3M`), triggering server re-fetch.
- Tooltip shows date + all three values formatted via `centsToDisplay`.
- Uses shadcn `ChartContainer` + `ChartTooltip` for consistent theming.
- **Per-widget loading state:** shows a skeleton overlay while new range data loads (uses `useTransition` isPending from the URL update).
- Empty state: "Net worth history will appear after your accounts sync."

#### `SpendingByCategory` (client)
- `ChartViewToggle` atom switches between:
  - **Donut view**: Recharts `PieChart` (ring) + ranked `SpendingCategoryRow` list beside it.
  - **Bar view**: Recharts `BarChart` (horizontal) with category labels.
- Current month label + left/right arrows for month navigation (updates `?spendMonth=2026-04` in URL).
- Top 8 categories shown; rest collapsed into "Other".
- **Empty state:** When selected month has zero transactions, shows centered message: "No spending data for [month]" with a muted icon — for both donut and bar views.
- Per-widget loading skeleton for month changes.

#### `CashFlowChart` (client)
- Recharts `BarChart` with grouped bars: income (green) and expenses (red) per month.
- Optional net line overlay.
- 6-month default view.

#### `RecentTransactionsWidget` (client)
- Compact list: date, merchant/name, amount (via `AmountDisplay`).
- Each row links to `/transactions` with date filter.
- "View all" link at bottom.

#### `AccountBalancesWidget` (client)
- Accounts grouped by type. Grouping is done in the **query layer** (`getAccountsByInstitution` already returns grouped data) — the widget does not import `classifyAccountType` directly.
- Each row: `AccountTypeIcon` + name + `BalanceDisplay`.
- "View all" link to `/accounts`.

#### `DashboardSummaryCards` (client)
- 2×2 grid of `SummaryCard` molecules.
- Cards: Net Worth, Monthly Income, Monthly Expenses, Net Savings.
- Uses `SummaryCard` `variant` prop: `positive` for income and positive net, `negative` for expenses and negative net.

---

## Refactoring

### 1. Extract account type classification — single source of truth

Currently `getAccountSummary` in `src/queries/accounts.ts` inlines the asset/liability classification. Extract to a shared helper:

```typescript
// src/lib/account-utils.ts
const ASSET_TYPES = new Set(["checking", "savings", "investment", "other"]);
const LIABILITY_TYPES = new Set(["credit", "loan"]);

export function classifyAccountType(type: string): "asset" | "liability"
```

`"other"` is classified as an asset (conservative default — you own it). No `"unknown"` return value — every account type maps to one of the two categories.

Used by `getAccountSummary` and `getNetWorthHistory` (query layer only). Components receive pre-classified data — they do not import this utility directly.

### 2. Fix sync-time balance recording

Two changes to `src/lib/plaid/sync.ts`:
1. Call `/accounts/balance/get` after `fetchAllPages` to get fresh (not Plaid-cached) balances.
2. Pass fresh balances to `applyToDb` as the `accountBalances` parameter (currently always `[]`).
3. Insert `balance_history` entries **after** the main transaction succeeds (not inside it — a history write failure must not roll back a successful sync). Use Drizzle's `onConflictDoUpdate` targeting `(accountId, date)` columns.

### 3. Create `src/lib/date-utils.ts`

New file for date utilities. Primary export:

```typescript
export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}
```

Named `todayDateString` (not `todayISO`) to be clear it returns a date string, not a full ISO timestamp. Used by snapshot job, backfill, sync balance recording.

### 4. Extract `baseTransactionQuery()` helper

Extract the 4-table LEFT JOIN pattern from `src/queries/transactions.ts` into a shared helper:

```typescript
function baseTransactionQuery(db: LedgrDb, householdId: string) {
  const scoped = scopedQuery(householdId, db);
  return db
    .select({ /* all transaction + joined fields */ })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(categoryGroups, eq(categories.groupId, categoryGroups.id))
    .where(scoped.where(transactions, notDeleted(transactions)));
}
```

Both `getTransactions` and `getRecentTransactions` call this base. Prevents the join pattern from drifting apart when schema changes.

### 5. Add `dashboard_layout` to user_settings

Add a `dashboardLayout` text column to `user_settings` table (stores JSON string). Migration + safe-parse fallback when reading (corrupted JSON falls back to default layout).

### 6. Add revalidation for dashboard path

Update `triggerSync` in `src/actions/sync.ts` to also call `revalidatePath("/")` so the dashboard shows fresh data after a sync completes. Currently only revalidates `/accounts` and `/transactions`.

---

## Testing

### Unit Tests (colocated)

**`src/lib/jobs/backfill-balances.test.ts`** (3-4 tests):
- Walks transactions backward correctly (known balance + known transactions = expected history).
- Handles days with no transactions (balance carries forward).
- Skips existing balance_history entries.
- Handles account with no transactions (single entry at current balance).
- Skips investment accounts.

**`src/components/organisms/widgets/registry.test.ts`** (2 tests):
- Default layout includes all active widget IDs.
- No duplicate widget IDs in registry.

### Property-Based Tests

- **Backfill invariant**: For any transaction sequence and known current balance, reconstructing balances backward then summing forward equals the original current balance. Uses `@fast-check/vitest`.
- **Net worth invariant**: For any set of account balances with classified types, `sum(assets) - sum(liabilities) === netWorth`.

### Integration Tests (`tests/integration/`)

**`dashboard-queries.test.ts`** (5-6 tests):
- `getNetWorthHistory` returns correct aggregation for date range with multiple accounts of different types.
- `getNetWorthHistory` appends synthetic "today" point matching `getDashboardSummary` net worth.
- `getMonthlySpending` groups by category, handles uncategorized, sorted by total desc.
- `getCashFlow` separates income/expense correctly across months.
- `getDashboardSummary` returns correct totals.
- Household isolation: queries return empty for wrong household.

**`balance-snapshot.test.ts`** (3 tests):
- Snapshot job creates correct balance_history entries.
- Idempotent: running twice on same day doesn't duplicate.
- Skips hidden, deleted, and null-balance accounts.

**`dashboard-actions.test.ts`** (2 tests):
- `saveDashboardLayout` persists and loads correctly (including per-breakpoint).
- `saveDashboardLayout` handles corrupted JSON gracefully (falls back to default).

### No E2E Tests

Dashboard is read-only visualization. Integration tests on queries + manual browser verification is sufficient for the cost/benefit trade-off.

**Test total: ~18-22 tests.**

---

## Dependencies

- `react-grid-layout` + `@types/react-grid-layout` — drag-and-drop grid (lightweight, well-maintained, 13k GitHub stars). Must be dynamically imported with `{ ssr: false }`.
- Recharts v3 + shadcn Chart — already installed.
- No other new dependencies.

## File Summary

```
New files:
  src/queries/dashboard.ts
  src/actions/dashboard.ts
  src/lib/account-utils.ts
  src/lib/date-utils.ts
  src/lib/jobs/backfill-balances.ts
  src/components/atoms/date-range-selector.tsx
  src/components/atoms/chart-view-toggle.tsx
  src/components/molecules/widget-placeholder.tsx
  src/components/molecules/spending-category-row.tsx
  src/components/organisms/dashboard-grid.tsx
  src/components/organisms/widgets/registry.ts
  src/components/organisms/widgets/net-worth-chart.tsx
  src/components/organisms/widgets/spending-by-category.tsx
  src/components/organisms/widgets/cash-flow-chart.tsx
  src/components/organisms/widgets/recent-transactions.tsx
  src/components/organisms/widgets/account-balances.tsx
  src/components/organisms/widgets/dashboard-summary-cards.tsx
  src/app/(dashboard)/page.tsx                          (replace stub)
  src/app/(dashboard)/loading.tsx                       (skeleton)
  tests/integration/dashboard-queries.test.ts
  tests/integration/balance-snapshot.test.ts
  tests/integration/dashboard-actions.test.ts
  src/lib/jobs/backfill-balances.test.ts
  src/components/organisms/widgets/registry.test.ts

Modified files:
  src/queries/accounts.ts                               (extract classification + baseTransactionQuery)
  src/queries/transactions.ts                           (extract baseTransactionQuery)
  src/lib/plaid/sync.ts                                 (fix accountBalances passing + balance_history insert after tx)
  src/lib/jobs/scheduler.ts                             (add midnight snapshot job)
  src/actions/sync.ts                                   (add revalidatePath("/"))
  src/components/molecules/summary-card.tsx              (add variant prop)
  src/db/schema/households.ts or migration              (dashboardLayout column)
```
