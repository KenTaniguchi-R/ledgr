# Phase 8 — Reports + CSV Export Design Spec

## Overview

Reports page provides deep financial analytics beyond the dashboard's glanceable widgets. Four report types in a tabbed layout, URL-driven filters with saved presets, comparison periods, and CSV export of filtered transactions.

**Design principles:** Reuse chart rendering logic from dashboard widgets (extract → share), follow existing query/action/component patterns, URL as source of truth for all filter state.

---

## Data Layer

### New File: `src/queries/reports.ts`

Four query functions following existing conventions (`householdId`, filters object, `db = defaultDb`):

| Function | Returns | Strategy |
|----------|---------|----------|
| `getSpendingByCategory(hId, filters)` | `SpendingRow[]` — `{categoryId, categoryName, groupName, groupId, total, prevTotal}` | GROUP BY category with LEFT JOIN for comparison period. Excludes transfers (`isTransfer = false`) and soft-deleted transactions. |
| `getIncomeVsExpense(hId, filters)` | `IncomeExpenseRow[]` — `{period, income, expenses, net}` | GROUP BY month, split by `categories.isIncome`. Always monthly granularity — simple and consistent. |
| `getCategoryTrends(hId, filters)` | `CategoryTrendRow[]` — `{period, categoryId, categoryName, total}` | GROUP BY (month, category). Up to 10 categories; rest rolled into "Other". |
| `getNetWorthHistory(hId, filters)` | Delegates to existing `dashboard.ts` `getNetWorthHistory` with account filter support added. |

**Filter type shared across all queries:**

```ts
type ReportFilters = {
  dateFrom: string;      // YYYY-MM-DD
  dateTo: string;        // YYYY-MM-DD
  accountIds?: string[];
  categoryIds?: string[];
};
```

**Comparison period:** Automatic. Given a date range, compute a same-length prior period via `shiftDateRange()`. Returned as `prevTotal` on spending rows. No comparison when range is "All time".

**Aggregation strategy:** SQL GROUP BY with SUM (not JS-side aggregation). The report queries deal with bounded result sets (categories, months) so SQL aggregation is appropriate, unlike the dashboard's unbounded transaction lists.

### Refactoring: `src/lib/date-utils.ts`

Extract from `dashboard.ts` and add:

| Function | Purpose |
|----------|---------|
| `rangeToDateBounds(range)` | Maps `"1M" \| "3M" \| "6M" \| "1Y" \| "all"` to `{from, to}`. Extracted from `dashboard.ts` private `rangeToDateFrom`. |
| `monthBounds(monthStr)` | `"2026-03"` → `{from: "2026-03-01", to: "2026-03-31"}`. Replaces inline logic in multiple files. |
| `shiftDateRange(from, to, direction)` | Shifts a date range backward by its own length. Used for comparison periods. |

After extraction, update `dashboard.ts` to import from `date-utils.ts` instead of using its private copy.

### Schema Addition: `saved_reports` table

```sql
CREATE TABLE saved_reports (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  report_type TEXT NOT NULL,  -- 'spending' | 'income-expense' | 'trends' | 'net-worth'
  filters TEXT NOT NULL,       -- JSON: serialized ReportFilters
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_saved_reports_household ON saved_reports(household_id);
```

Add to Drizzle schema in `src/db/schema/reports.ts`.

### New File: `src/actions/reports.ts`

Three server actions following existing conventions:

| Action | Input | Behavior |
|--------|-------|----------|
| `saveReport({name, reportType, filters})` | Zod-validated | Insert into `saved_reports`, return `{success: true, id}` |
| `deleteReport(reportId)` | string | Ownership verification via `scopedQuery`, delete, return `{success: true}` |
| `getSavedReports()` | none | Return all saved reports for household, ordered by `updatedAt DESC` |

Revalidation target: `/reports`.

### New File: `src/queries/saved-reports.ts`

| Function | Purpose |
|----------|---------|
| `getSavedReportsByHousehold(hId, db)` | Fetch all saved reports for household |
| `getSavedReportById(id, hId, db)` | Fetch single saved report with ownership check |

---

## Component Architecture

### Refactoring: Extract Chart Renderers

Extract pure rendering logic from dashboard widgets into reusable atoms. Dashboard widgets become thin wrappers (fetch + render). Report tabs use the same renderers with richer data.

| New Atom | Extracted From | Props |
|----------|---------------|-------|
| `atoms/spending-chart.tsx` | `widgets/spending-by-category.tsx` | `data: {name, value, color}[], viewMode: "donut" \| "bar"` |
| `atoms/cash-flow-chart.tsx` | `widgets/cash-flow-chart.tsx` | `data: {period, income, expenses, net}[], height?: number` |
| `atoms/net-worth-area-chart.tsx` | `widgets/net-worth-chart.tsx` | `data: {date, assets, liabilities, netWorth}[], height?: number` |
| `atoms/trend-line-chart.tsx` | New | `data: {period, series: {name, value}[]}[], categoryNames: string[]` |

All chart atoms are `"use client"`, import from `recharts` directly, use `ResponsiveContainer`, and format with `centsToDisplay`.

After extraction, update dashboard widget files to import and wrap these atoms.

### New Molecules

| Component | Purpose |
|-----------|---------|
| `molecules/report-filter-bar.tsx` | Date range presets (1M/3M/6M/1Y/All/Custom) + account multi-select + category multi-select. Pushes to searchParams via `router.push`. Reuses `DateRangeSelector` atom for presets. |
| `molecules/comparison-badge.tsx` | Renders percentage change with up/down arrow + green/red color. Props: `current: number, previous: number`. |
| `molecules/report-tab-header.tsx` | Tab title + save report button. |
| `molecules/saved-report-picker.tsx` | Dropdown listing saved reports. Selecting one pushes its stored filters to searchParams. Includes save (opens name dialog) and delete actions. |

### New Organisms

| Component | Purpose |
|-----------|---------|
| `organisms/report-spending.tsx` | Spending tab body. Donut/bar chart toggle (reuses `spending-chart.tsx` atom) + category breakdown table with `total`, `prevTotal`, `comparison-badge`. |
| `organisms/report-income-expense.tsx` | Income vs Expense tab body. Stacked bar chart (reuses `cash-flow-chart.tsx` atom) + summary row showing totals + net. |
| `organisms/report-trends.tsx` | Category Trends tab body. Multi-line chart (`trend-line-chart.tsx` atom) + category selector checkboxes (max 10). |
| `organisms/report-net-worth.tsx` | Net Worth tab body. Area chart (reuses `net-worth-area-chart.tsx` atom) + account filter. |

### Page Structure

```
(dashboard)/reports/
├── page.tsx        — async server component, reads searchParams (?tab, ?from, ?to, ?accounts, ?categories)
├── loading.tsx     — skeleton: tab bar + chart placeholder + table rows
├── error.tsx       — standard AlertCircle + reset pattern
```

**`page.tsx` logic:**
1. `await getHouseholdId()`
2. `await searchParams` → parse tab, date range, account/category filters
3. Call only the query for the active tab (no wasted queries)
4. Fetch saved reports list
5. Render `<Tabs>` with `report-filter-bar` + `saved-report-picker` above, active tab organism below

**Sidebar:** Add "Reports" entry to `sidebar-nav.tsx` between "Budgets" and any future entries.

### Dashboard Widget Update

Replace the `budgets` placeholder in `widgets/registry.ts` (`isPlaceholder: true`, `placeholderText: "Coming in Phase 8"`) with a real `BudgetProgressWidget` that shows current month's budget utilization as a progress bar. Uses existing `getBudgetSpending` from `queries/budgets.ts`.

---

## CSV Export

### API Route: `app/api/export/transactions/route.ts`

GET route handler. Not a server action — server actions can't stream file responses.

**Query params:** Same as transaction filters: `from`, `to`, `account`, `category`, `q`, `reviewed`.

**Response:**
- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="ledgr-transactions-YYYY-MM-DD.csv"`
- UTF-8 BOM (`\xEF\xBB\xBF`) prepended for Excel compatibility

**Columns:**

| Column | Source | Format |
|--------|--------|--------|
| Date | `transaction.date` | YYYY-MM-DD |
| Account | `account.name` | string |
| Merchant | `merchant.name` | string |
| Amount | `transaction.normalizedAmount` | Dollars with 2 decimals (e.g., `-12.50`). Negative = expense, positive = income. |
| Category | `category.name` | string |
| Category Group | `categoryGroup.name` | string |
| Notes | `transaction.notes` | string |
| Original Description | `transaction.originalDescription` | string |

**Implementation:** Uses `baseTransactionQuery` from `queries/transactions.ts` with the same joins. No streaming needed for personal finance volumes (<100k rows) — build full CSV string in memory, return as Response. If scale becomes an issue later, switch to `ReadableStream`.

**UI:** Add an export button (download icon) to the existing `transaction-filters.tsx` molecule on the transactions page. Clicking it constructs the API URL from current searchParams and triggers download via `<a download>` or `window.location.assign`.

---

## Data Flow

### Filter → URL → Server → Client

```
User changes filter in report-filter-bar
  → router.push updates searchParams
  → page.tsx (server component) re-renders
  → reads searchParams, calls report query for active tab only
  → passes data as props to active tab organism
  → organism renders chart atom + data table
```

URL is the single source of truth. Every report state is bookmarkable and shareable.

### Tab Switching

`?tab=spending|income-expense|trends|net-worth`. Changing tabs preserves all other filters in the URL. Default tab is `spending`.

### Comparison Period

Automatic based on date range. If user selects Jan 1 – Mar 31 (90 days), comparison period is Oct 3 – Dec 31 (prior 90 days). `shiftDateRange` computes this. No comparison when "All time" is selected. `comparison-badge.tsx` renders the delta inline next to totals.

### Saved Reports

```
Save: Click save → name dialog → saveReport action → persists {name, reportType, filters as JSON}
Load: Pick from saved-report-picker → router.push with stored filters → standard re-render
Delete: Click delete on picker item → deleteReport action → remove from list
```

Saved reports are stored searchParams — no special loading path. Loading a saved report just pushes its filters to the URL.

### CSV Export

```
Click export button on transactions page filter bar
  → construct /api/export/transactions?from=...&to=...&account=... from current searchParams
  → browser navigates to URL → API route builds CSV → browser downloads file
```

---

## Testing

### Integration Tests: `tests/integration/report-queries.test.ts` (~6 tests)

1. Spending by category returns correct totals grouped by category
2. Spending comparison period calculates correct deltas vs prior period
3. Income vs expense splits correctly by `categories.isIncome` flag
4. Category trends groups by month + category with correct totals
5. Account filter narrows report results to selected accounts only
6. Transfers excluded from spending reports (`isTransfer = true` rows omitted)

### Integration Tests: `tests/integration/report-actions.test.ts` (~3 tests)

1. Save report persists filters JSON and loads back with correct shape
2. Delete report with ownership verification (can't delete another household's report)
3. Saved reports scoped to household (isolation test)

### Unit Tests: `src/lib/date-utils.test.ts` (~3 property-based tests)

1. `rangeToDateBounds` returns valid date strings for all preset values
2. `monthBounds` returns first and last day for any valid YYYY-MM input (property: last day is always valid calendar date)
3. `shiftDateRange` shifted range has same length as original (property-based with fast-check)

### Integration Tests: `tests/integration/csv-export.test.ts` (~3 tests)

1. Export respects active filters (date range, account) — filtered out transactions not in CSV
2. Amounts exported in dollars with 2 decimal places (not cents)
3. UTF-8 BOM present as first 3 bytes of response

### No Tests For

- Chart rendering atoms (declarative Recharts config)
- `loading.tsx` / `error.tsx` (declarative markup)
- Tab switching (URL-driven, no logic to test)
- Comparison badge (pure display)

**Total: ~15 tests** (6 report queries + 3 report actions + 3 date utils + 3 CSV export)

---

## Files Summary

### New Files

| File | Type |
|------|------|
| `src/queries/reports.ts` | Report aggregation queries |
| `src/queries/saved-reports.ts` | Saved report CRUD queries |
| `src/actions/reports.ts` | Server actions for saved reports |
| `src/db/schema/reports.ts` | `saved_reports` Drizzle schema |
| `src/components/atoms/spending-chart.tsx` | Donut/bar chart renderer |
| `src/components/atoms/cash-flow-chart.tsx` | Grouped bar chart renderer |
| `src/components/atoms/net-worth-area-chart.tsx` | Area + line chart renderer |
| `src/components/atoms/trend-line-chart.tsx` | Multi-series line chart |
| `src/components/molecules/report-filter-bar.tsx` | Date/account/category filter bar |
| `src/components/molecules/comparison-badge.tsx` | Percentage change display |
| `src/components/molecules/report-tab-header.tsx` | Tab title + save button |
| `src/components/molecules/saved-report-picker.tsx` | Saved report dropdown |
| `src/components/organisms/report-spending.tsx` | Spending tab |
| `src/components/organisms/report-income-expense.tsx` | Income vs Expense tab |
| `src/components/organisms/report-trends.tsx` | Trends tab |
| `src/components/organisms/report-net-worth.tsx` | Net Worth tab |
| `src/components/organisms/widgets/budget-progress.tsx` | Budget widget (replaces placeholder) |
| `src/app/(dashboard)/reports/page.tsx` | Reports page |
| `src/app/(dashboard)/reports/loading.tsx` | Loading skeleton |
| `src/app/(dashboard)/reports/error.tsx` | Error boundary |
| `src/app/api/export/transactions/route.ts` | CSV export endpoint |
| `tests/integration/report-queries.test.ts` | Report query tests |
| `tests/integration/report-actions.test.ts` | Saved report action tests |
| `tests/integration/csv-export.test.ts` | CSV export tests |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/date-utils.ts` | Add `rangeToDateBounds`, `monthBounds`, `shiftDateRange` |
| `src/lib/date-utils.test.ts` | Property-based tests for new functions |
| `src/queries/dashboard.ts` | Import `rangeToDateBounds` from `date-utils.ts`, remove private copy. Add optional `accountIds` filter to `getNetWorthHistory`. |
| `src/db/schema/index.ts` | Export `saved_reports` schema |
| `src/components/organisms/widgets/spending-by-category.tsx` | Extract rendering to `atoms/spending-chart.tsx`, wrap |
| `src/components/organisms/widgets/cash-flow-chart.tsx` | Extract rendering to `atoms/cash-flow-chart.tsx`, wrap |
| `src/components/organisms/widgets/net-worth-chart.tsx` | Extract rendering to `atoms/net-worth-area-chart.tsx`, wrap |
| `src/components/organisms/widgets/registry.ts` | Replace budgets placeholder with real `BudgetProgressWidget` |
| `src/components/organisms/dashboard-grid.tsx` | Add `budget-progress` case to `renderWidget` |
| `src/components/molecules/transaction-filters.tsx` | Add CSV export button |
| `src/components/organisms/sidebar-nav.tsx` | Add "Reports" link |
