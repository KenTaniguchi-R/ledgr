# Phase 6 — Dashboard + Net Worth Design Spec

## Overview

Transform the dashboard stub into a fully functional financial overview with drag-and-drop widget customization. Core widgets: net worth history chart, spending by category (donut + bar views), monthly cash flow, recent transactions, account balances, and dashboard summary cards. Placeholder widgets for future phases (budgets, bills, goals).

## Architecture: Widget Registry + Composition

Each dashboard widget is an independent organism. A widget registry (simple config array) drives both the drag-and-drop grid and rendering. The dashboard page is a thin server component that fetches all data upfront and passes it to a `DashboardGrid` client organism.

```
DashboardPage (server)
  └── DashboardGrid (client, drag-and-drop)
        ├── NetWorthChart (client, Recharts)
        ├── SpendingByCategory (client, Recharts)
        ├── CashFlowChart (client, Recharts)
        ├── RecentTransactionsWidget (server-compatible)
        ├── AccountBalancesWidget (server-compatible)
        ├── DashboardSummaryCards (server-compatible)
        └── WidgetPlaceholder × 3 (budget, bills, goals)
```

---

## Data Layer

### Queries — `src/queries/dashboard.ts`

All functions follow the existing `scopedQuery(householdId, db)` pattern with optional `db` parameter for testability.

#### `getDashboardSummary(householdId, db?)`

Returns `{ netWorth: number, monthlyIncome: number, monthlyExpenses: number, monthlyNet: number }`.

- Net worth reuses the asset/liability classification logic extracted from `getAccountSummary`.
- Monthly figures sum `normalizedAmount` on current-month transactions, splitting income (negative normalizedAmount) from expenses (positive normalizedAmount).

#### `getNetWorthHistory(householdId, range, db?)`

Returns `{ date: string, assets: number, liabilities: number, netWorth: number }[]`.

- `range`: `"1M" | "3M" | "6M" | "1Y" | "all"` — converted to a `dateFrom` filter.
- Aggregates `balance_history` rows by date, joining with `accounts` to classify each as asset or liability.
- Groups by date: `assets = sum(balance WHERE type IN asset_types)`, `liabilities = sum(balance WHERE type IN liability_types)`, `netWorth = assets - liabilities`.
- Excludes hidden and deleted accounts.

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

- Reuses the same join pattern from `src/queries/transactions.ts` (accounts, merchants, categories, categoryGroups).
- No filters, fixed limit (default 5), ordered by date desc + id desc.
- No cursor pagination.

### Server Actions — `src/actions/dashboard.ts`

#### `saveDashboardLayout(layout)`

- Validates layout with Zod schema.
- Upserts `user_settings` row for current user with `dashboard_layout` JSON.
- No `revalidatePath` needed (client state already updated optimistically).

#### `loadNetWorthHistory(range)`

- Server action called by `DateRangeSelector` when user changes range.
- Calls `getNetWorthHistory(householdId, range)` and returns the data.
- Avoids full page reload for range changes.

#### `loadMonthlySpending(month)`

- Server action for navigating spending widget to a different month.

#### `loadCashFlow(months)`

- Server action for adjusting cash flow lookback period.

---

## Balance Snapshot Job

### Daily Snapshot — `src/lib/jobs/scheduler.ts`

New cron job: `"0 0 * * *"` (midnight daily).

```
For each account WHERE deletedAt IS NULL AND isHidden = false:
  INSERT INTO balance_history (id, accountId, date, balance)
  VALUES (uuid, accountId, todayISO(), currentBalance)
  ON CONFLICT (accountId, date) DO NOTHING
```

Idempotent — safe to run multiple times per day.

### Sync-Time Balance Recording — `src/lib/plaid/sync.ts`

In `applyToDb`, after updating `accounts.currentBalance`, also insert/update `balance_history` for today:

```
ON CONFLICT (accountId, date) DO UPDATE SET balance = excluded.balance
```

This ensures balance_history reflects the latest balance from any sync that day.

### Backfill — `src/lib/jobs/backfill-balances.ts`

Reconstructs approximate historical balances by walking transactions backward from `currentBalance`.

Algorithm:
1. For each non-deleted, non-hidden account with a `currentBalance`:
2. Get all posted transactions ordered by date desc.
3. Starting from `currentBalance` on today's date, walk backward:
   - For each day with transactions, subtract the day's net `normalizedAmount` to get the previous day's balance.
   - Insert `balance_history` row for that date.
4. Skip dates that already have entries (non-destructive).
5. Stop at the account's `createdAt` date or the earliest transaction date.

Triggered explicitly via `pnpm db:backfill-balances` CLI command. Also called automatically on first dashboard page load if any non-hidden account has zero `balance_history` rows (checked via a fast COUNT query). Idempotent — safe to run multiple times.

---

## Widget Registry & Grid

### Registry — `src/components/organisms/widgets/registry.ts`

```typescript
type WidgetSize = { w: number; h: number };

type WidgetConfig = {
  id: string;
  title: string;
  defaultSize: WidgetSize;
  minSize?: WidgetSize;
  component: string;
  placeholderText?: string;
};

const DASHBOARD_WIDGETS: WidgetConfig[] = [
  { id: "net-worth",    title: "Net Worth",       defaultSize: { w: 2, h: 2 }, component: "net-worth-chart" },
  { id: "accounts",     title: "Account Balances", defaultSize: { w: 2, h: 1 }, component: "account-balances" },
  { id: "summary",      title: "Summary",          defaultSize: { w: 2, h: 1 }, component: "dashboard-summary" },
  { id: "spending",     title: "Spending",          defaultSize: { w: 2, h: 2 }, component: "spending-by-category" },
  { id: "cash-flow",    title: "Cash Flow",         defaultSize: { w: 2, h: 1 }, component: "cash-flow-chart" },
  { id: "recent-txns",  title: "Recent Transactions", defaultSize: { w: 2, h: 2 }, component: "recent-transactions" },
  { id: "budgets",      title: "Budget Progress",   defaultSize: { w: 2, h: 1 }, component: "placeholder", placeholderText: "Coming in Phase 8" },
  { id: "bills",        title: "Upcoming Bills",    defaultSize: { w: 2, h: 1 }, component: "placeholder", placeholderText: "Coming in Phase 10" },
  { id: "goals",        title: "Goals",             defaultSize: { w: 2, h: 1 }, component: "placeholder", placeholderText: "Coming in Phase 13" },
];
```

### Default Layout (4-column grid)

| Row | Col 1-2 | Col 3-4 |
|-----|---------|---------|
| 1   | Net Worth Chart (2×2) | Account Balances (2×1) |
| 2   | (continued) | Summary Cards (2×1) |
| 3   | Spending by Category (2×2) | Cash Flow (2×1) |
| 4   | (continued) | Recent Transactions (2×2) |
| 5   | — | (continued) |

Placeholder widgets (budgets, bills, goals) are hidden by default but available in a widget picker to add to the grid.

### DashboardGrid — `src/components/organisms/dashboard-grid.tsx`

- Client component using `react-grid-layout` for drag-and-drop.
- Props: `layout`, `data` (all dashboard data from server), `onLayoutChange`.
- Renders each widget by matching `component` key to React component via a simple switch/map.
- Each widget wrapped in a `Card` with title bar and drag handle.
- Layout changes debounced and saved via `saveDashboardLayout` server action.
- Responsive: collapses to 2 columns on tablet, 1 column on mobile.

---

## Widget Components

### Atomic Design Hierarchy

**Molecules (new):**

- `WidgetPlaceholder` — "Coming soon" card with muted icon, title, and description text. Props: `title: string`, `description: string`.
- `DateRangeSelector` — toggle group with preset buttons (1M, 3M, 6M, 1Y, All). Props: `value: string`, `onChange: (range) => void`. Uses shadcn `ToggleGroup`.
- `ChartViewToggle` — tab switcher (Donut / Bar). Props: `value: "donut" | "bar"`, `onChange`. Uses shadcn `Tabs`.
- `SpendingCategoryRow` — category name + icon + amount + percentage bar. Props: `name, icon, amount, percentage, color`.

**Organisms (one per widget):**

#### `NetWorthChart` (client)
- Recharts `AreaChart` with three series: assets (green fill), liabilities (red fill), net worth (blue line).
- `DateRangeSelector` in the widget header.
- Range changes call `loadNetWorthHistory(range)` server action, update local state.
- Tooltip shows date + all three values formatted via `centsToDisplay`.
- Uses shadcn `ChartContainer` + `ChartTooltip` for consistent theming.

#### `SpendingByCategory` (client)
- `ChartViewToggle` switches between:
  - **Donut view**: Recharts `PieChart` (ring) + ranked `SpendingCategoryRow` list beside it.
  - **Bar view**: Recharts `BarChart` (horizontal) with category labels.
- Current month label + left/right arrows for month navigation.
- Month changes call `loadMonthlySpending(month)` server action.
- Top 8 categories shown; rest collapsed into "Other".

#### `CashFlowChart` (client)
- Recharts `BarChart` with grouped bars: income (green) and expenses (red) per month.
- Optional net line overlay.
- 6-month default view.

#### `RecentTransactionsWidget` (server-compatible)
- Compact list: date, merchant/name, amount (via `AmountDisplay`).
- Each row links to `/transactions` with date filter.
- "View all" link at bottom.

#### `AccountBalancesWidget` (server-compatible)
- Accounts grouped by type (checking, savings, credit, etc.).
- Each row: `AccountTypeIcon` + name + `BalanceDisplay`.
- "View all" link to `/accounts`.

#### `DashboardSummaryCards` (server-compatible)
- 2×2 grid of `SummaryCard` molecules.
- Cards: Net Worth, Monthly Income, Monthly Expenses, Net Savings.
- Color-coded: green for positive net, red for negative.

---

## Refactoring

### 1. Extract account type classification

Currently `getAccountSummary` in `src/queries/accounts.ts` inlines the asset/liability classification. Extract to a shared helper:

```typescript
// src/lib/account-utils.ts
const ASSET_TYPES = new Set(["checking", "savings", "investment"]);
const LIABILITY_TYPES = new Set(["credit", "loan"]);

export function classifyAccountType(type: string): "asset" | "liability" | "unknown"
```

Used by `getAccountSummary`, `getNetWorthHistory`, and `AccountBalancesWidget`.

### 2. Add balance_history insertion to sync flow

In `src/lib/plaid/sync.ts` `applyToDb`, after updating account balances, insert today's balance_history entry with `ON CONFLICT DO UPDATE`.

### 3. Ensure `todayISO()` is shared

Verify `todayISO()` from `src/actions/plaid.ts` is in a shared utility (likely `src/lib/money.ts` or a new `src/lib/date-utils.ts`). Used by snapshot job, backfill, and sync.

### 4. Add `dashboard_layout` to user_settings

Check if `user_settings` table has a flexible JSON column. If not, add a `dashboardLayout` text column (stores JSON string).

---

## Testing

### Unit Tests (colocated)

**`src/lib/jobs/backfill-balances.test.ts`** (3-4 tests):
- Walks transactions backward correctly (known balance + known transactions = expected history).
- Handles days with no transactions (balance carries forward).
- Skips existing balance_history entries.
- Handles account with no transactions (single entry at current balance).

**`src/components/organisms/widgets/registry.test.ts`** (2 tests):
- Default layout includes all active widget IDs.
- No duplicate widget IDs in registry.

### Property-Based Tests

- **Backfill invariant**: For any transaction sequence and known current balance, reconstructing balances backward then summing forward equals the original current balance. Uses `@fast-check/vitest`.
- **Net worth invariant**: For any set of account balances with classified types, `sum(assets) - sum(liabilities) === netWorth`.

### Integration Tests (`tests/integration/`)

**`dashboard-queries.test.ts`** (5-6 tests):
- `getNetWorthHistory` returns correct aggregation for date range with multiple accounts of different types.
- `getMonthlySpending` groups by category, handles uncategorized, sorted by total desc.
- `getCashFlow` separates income/expense correctly across months.
- `getDashboardSummary` returns correct totals.
- Household isolation: queries return empty for wrong household.

**`balance-snapshot.test.ts`** (3 tests):
- Snapshot job creates correct balance_history entries.
- Idempotent: running twice on same day doesn't duplicate.
- Skips hidden and deleted accounts.

**`dashboard-actions.test.ts`** (2 tests):
- `saveDashboardLayout` persists and loads correctly.
- `loadNetWorthHistory` returns filtered data for specified range.

### No E2E Tests

Dashboard is read-only visualization. Integration tests on queries + manual browser verification is sufficient for the cost/benefit trade-off.

**Test total: ~18-20 tests.**

---

## Dependencies

- `react-grid-layout` — drag-and-drop grid (lightweight, well-maintained, 13k GitHub stars).
- Recharts v3 + shadcn Chart — already installed.
- No other new dependencies.

## File Summary

```
New files:
  src/queries/dashboard.ts
  src/actions/dashboard.ts
  src/lib/account-utils.ts
  src/lib/jobs/backfill-balances.ts
  src/components/molecules/widget-placeholder.tsx
  src/components/molecules/date-range-selector.tsx
  src/components/molecules/chart-view-toggle.tsx
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
  src/queries/accounts.ts                               (extract classification)
  src/lib/plaid/sync.ts                                 (add balance_history insert)
  src/lib/jobs/scheduler.ts                             (add midnight snapshot job)
  src/db/schema/households.ts or migration              (dashboardLayout column if needed)
```
