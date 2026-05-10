# Phase 8 — Reports + CSV Export Design Spec

## Overview

Reports page provides deep financial analytics beyond the dashboard's glanceable widgets. Four report types in a tabbed layout, URL-driven filters with saved presets, comparison periods, and CSV export of filtered transactions.

**Design principles:** Reuse chart rendering logic from dashboard widgets (extract → share), follow existing query/action/component patterns, URL as source of truth for all filter state.

---

## Prerequisites

### shadcn Components to Install

The following shadcn components must be installed before implementation begins:

```bash
pnpm dlx shadcn@latest add popover command checkbox
```

- `popover.tsx` — Required for multi-select dropdowns in report filter bar
- `command.tsx` — Required for searchable multi-select (Popover + Command pattern)
- `checkbox.tsx` — Required for category selector in trends tab and multi-select items

---

## Data Layer

### New File: `src/queries/reports.ts`

Four query functions following existing conventions (`householdId`, filters object, `db = defaultDb`):

| Function | Returns | Strategy |
|----------|---------|----------|
| `getSpendingByCategory(hId, filters)` | `SpendingRow[]` — `{categoryId, categoryName, groupName, groupId, total, prevTotal}` | GROUP BY category using conditional aggregation: `SUM(CASE WHEN date BETWEEN :from AND :to THEN normalizedAmount END)` for current period and `SUM(CASE WHEN date BETWEEN :prevFrom AND :prevTo THEN normalizedAmount END)` for prior period. Single query, no self-join. |
| `getIncomeVsExpense(hId, filters)` | `IncomeExpenseRow[]` — `{period, income, expenses, net}` | GROUP BY month. Split by `normalizedAmount` sign: `SUM(CASE WHEN normalizedAmount > 0 THEN normalizedAmount END)` for expenses, `SUM(CASE WHEN normalizedAmount < 0 THEN ABS(normalizedAmount) END)` for income. Always monthly granularity. |
| `getCategoryTrends(hId, filters)` | `CategoryTrendRow[]` — `{period, categoryId, categoryName, total}` | GROUP BY (month, category). Split-aware two-pass strategy (same as `getBudgetSpending`). Up to 10 categories; rest rolled into "Other". |
| `getReportNetWorthHistory(hId, filters)` | `NetWorthPoint[]` — `{date, assets, liabilities, netWorth}` | Separate function (not delegation). Queries `balanceHistory` joined to `accounts` with `scopedQuery`, filtering `isHidden = false` and `notDeleted`. Accepts `{dateFrom, dateTo, accountIds}` directly. |

**Critical guards applied to ALL transaction-based queries:**
- `WHERE normalizedAmount > 0` for spending queries (excludes income) — matches `dashboard.ts` and `budgets.ts` pattern
- `AND pending = false` — excludes pending transactions, matching all existing aggregation queries
- `AND deletedAt IS NULL` — excludes soft-deleted transactions via `notDeleted()`
- `AND (isTransfer = false AND transferPairId IS NULL)` — excludes transfers by both flag and pair ID as double guard

**Income vs expense classification:** Uses `normalizedAmount` sign, NOT `categories.isIncome`. This is consistent with `getCashFlow` and `getDashboardSummary` in `dashboard.ts`, and correctly handles uncategorized transactions (NULL `categoryId`).

**Split transaction handling:** `getSpendingByCategory` and `getCategoryTrends` use the same two-pass strategy as `getBudgetSpending` in `queries/budgets.ts`: (1) identify split parents via `transaction_splits`, exclude them from the main aggregation, (2) aggregate split amounts separately by their per-split `categoryId`, (3) merge results.

**Filter type shared across all queries:**

```ts
type ReportFilters = {
  dateFrom: string;      // YYYY-MM-DD
  dateTo: string;        // YYYY-MM-DD
  accountIds?: string[]; // comma-separated in URL, parsed to array in page.tsx
  categoryIds?: string[];
};
```

**URL encoding for array params:** Comma-separated values. `?accounts=id1,id2,id3`. Parsed in `page.tsx` via `params.accounts?.split(",")`. Consistent convention for both accounts and categories.

**Comparison period:** Automatic. For preset ranges (1M/3M/6M/1Y), use month-aligned comparison (e.g., "3M" = prior 3 calendar months). For custom date ranges, shift by exact day count. No comparison when range is "All time". The `comparison-badge` displays the comparison period dates (e.g., "vs Oct 1 – Dec 31") so users can verify what they're comparing against.

**Aggregation strategy:** SQL GROUP BY with SUM using conditional aggregation (not JS-side aggregation, not LEFT JOIN). The report queries deal with bounded result sets (categories, months) so SQL aggregation is appropriate.

### Refactoring: `src/lib/date-utils.ts`

Extract from `dashboard.ts` and add:

| Function | Purpose |
|----------|---------|
| `rangeToDateBounds(range)` | Maps `"1M" \| "3M" \| "6M" \| "1Y" \| "all"` to `{from, to}`. Extracted from `dashboard.ts` private `rangeToDateFrom`. |
| `monthBounds(monthStr)` | `"2026-03"` → `{from: "2026-03-01", to: "2026-03-31"}`. Replaces inline logic in multiple files. |
| `shiftDateRange(from, to, direction)` | For preset ranges: shifts by calendar months. For custom ranges: shifts by exact day count. Returns `{from, to}` of the comparison period. |
| `comparisonLabel(from, to)` | Formats a date range as "vs MMM D – MMM D" for display in `comparison-badge`. |

After extraction, update `dashboard.ts` to import from `date-utils.ts` instead of using its private copy.

### New Shared Hook: `src/hooks/use-search-param-filters.ts`

Extract URL manipulation logic from `transaction-filters.tsx` into a reusable hook:

```ts
function useSearchParamFilters() {
  // Returns: { updateFilter, updateFilters, clearFilters, hasFilters, searchParams }
  // updateFilter(key, value) — sets or deletes a single param
  // updateFilters(entries) — sets or deletes multiple params atomically
  // clearFilters() — resets to pathname only
}
```

Both `transaction-filters.tsx` and `report-filter-bar.tsx` import this hook instead of duplicating the `router.push` + `URLSearchParams` logic.

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

Two mutation-only server actions following existing conventions:

| Action | Input | Behavior |
|--------|-------|----------|
| `saveReport({name, reportType, filters})` | Zod-validated | Insert into `saved_reports`, return `{success: true, id}` |
| `deleteReport(reportId)` | string | Ownership verification via `scopedQuery`, delete, return `{success: true}` |

Revalidation target: `/reports`.

**Note:** `getSavedReports` is NOT a server action. Reading data belongs in the queries layer, consistent with the established pattern where `page.tsx` calls queries directly.

### New File: `src/queries/saved-reports.ts`

| Function | Purpose |
|----------|---------|
| `getSavedReportsByHousehold(hId, db)` | Fetch all saved reports for household, ordered by `updatedAt DESC` |
| `getSavedReportById(id, hId, db)` | Fetch single saved report with ownership check |

Called directly from `reports/page.tsx`, same as `getCategories()` and `getAccounts()` are called in `transactions/page.tsx`.

---

## Component Architecture

### Refactoring: Extract Chart Renderers

Extract pure rendering logic from dashboard widgets into reusable atoms. Dashboard widgets become thin wrappers (fetch + render). Report tabs use the same renderers with richer data.

**Important:** Chart atoms are pure renderers. They do NOT own toggle state, navigation controls, or data-fetching. The caller manages `viewMode` state and renders `ChartViewToggle` / `DateRangeSelector` independently above the atom.

| New Atom | Extracted From | Props |
|----------|---------------|-------|
| `atoms/spending-chart.tsx` | `widgets/spending-by-category.tsx` | `data: MonthlySpendingRow[], viewMode: "donut" \| "bar"`. Color assignment happens inside the atom (index-based from shared `CHART_COLORS` constant). Caller manages `viewMode` state and renders `ChartViewToggle` separately. |
| `atoms/cash-flow-bar-chart.tsx` | `widgets/cash-flow-chart.tsx` | `data: {month, income, expenses}[], height?: number`. `net` is computed inside the atom for tooltip display, not required as a prop. Uses existing `CashFlowRow` type directly — no new type needed. |
| `atoms/net-worth-area-chart.tsx` | `widgets/net-worth-chart.tsx` | `data: NetWorthPoint[], height?: number`. Uses existing `NetWorthPoint` type from `dashboard.ts`. |
| `atoms/trend-line-chart.tsx` | New | `data: {period: string, [categoryName: string]: number \| string}[], categories: {name: string, color: string}[]`. Multi-series Recharts `LineChart` with one `<Line>` per category. |

Shared color constant: Extract `COLORS` array from `spending-by-category.tsx` to `src/lib/chart-colors.ts` for reuse across all chart atoms and report organisms.

After extraction, update dashboard widget files to import and wrap these atoms.

### New Molecules

| Component | Purpose |
|-----------|---------|
| `molecules/report-filter-bar.tsx` | Date range presets (1M/3M/6M/1Y/All via `DateRangeSelector` atom) + custom date inputs + account multi-select + category multi-select. Uses `useSearchParamFilters` hook. Multi-select uses shadcn Popover + Command pattern (searchable checkbox list inside a popover). |
| `molecules/comparison-badge.tsx` | Renders percentage change with up/down arrow + green/red color. Props: `current: number, previous: number, periodLabel: string`. Displays both the percentage and the comparison period dates (e.g., "+12% vs Oct 1 – Dec 31"). |

### New Organisms

| Component | Purpose |
|-----------|---------|
| `organisms/report-tabs.tsx` | **Client component.** Wraps shadcn `<Tabs>` with `useSearchParams()` for controlled `value` state. Handles `onValueChange` via `router.push` to update `?tab=` param. This is necessary because `onValueChange` requires a client component boundary — `page.tsx` (server) cannot render interactive Tabs directly. |
| `organisms/saved-report-picker.tsx` | **Organism** (promoted from molecule due to complexity). Dropdown listing saved reports with load/delete actions. Includes inline save dialog. **Radix composition note:** The save button inside the `DropdownMenu` must use `event.preventDefault()` in `onSelect` + external `useState` for dialog open state to prevent Radix from closing the dropdown before the dialog opens. |
| `organisms/report-spending.tsx` | Spending tab body. Donut/bar chart toggle (renders `ChartViewToggle` + `spending-chart.tsx` atom) + category breakdown table with `total`, `prevTotal`, `comparison-badge`. |
| `organisms/report-income-expense.tsx` | Income vs Expense tab body. Grouped bar chart (reuses `cash-flow-bar-chart.tsx` atom) + summary row showing totals + net. |
| `organisms/report-trends.tsx` | Category Trends tab body. Multi-line chart (`trend-line-chart.tsx` atom) + category selector using `Checkbox` components (max 10 selected). |
| `organisms/report-net-worth.tsx` | Net Worth tab body. Area chart (reuses `net-worth-area-chart.tsx` atom) + account filter. |

**Removed:** `report-tab-header.tsx` molecule — unnecessary abstraction. Save button is part of `saved-report-picker.tsx`. Tab title is inline in `report-tabs.tsx`.

### Page Structure

```
(dashboard)/reports/
├── page.tsx        — async server component, reads searchParams
├── loading.tsx     — skeleton: tab bar + chart placeholder + table rows
├── error.tsx       — standard AlertCircle + reset pattern
```

**`page.tsx` logic:**
1. `await getHouseholdId()`
2. `await searchParams` → parse tab, date range, account/category filters
3. Parse `accounts` param: `typeof params.accounts === "string" ? params.accounts.split(",") : undefined`
4. Call only the query for the active tab (no wasted queries)
5. Call `getSavedReportsByHousehold(householdId)` for the picker
6. Render `<ReportTabs>` (client) with `report-filter-bar` + `saved-report-picker` above, active tab organism below. Pass data as props from server to client.

**Sidebar:** Add "Reports" entry to `sidebar-nav.tsx` between "Budgets" and any future entries.

### Dashboard Widget Update

Replace the `budgets` placeholder in `widgets/registry.ts` (`isPlaceholder: true`, `placeholderText: "Coming in Phase 8"`) with a real `BudgetProgressWidget`:
- Always shows **current month** budget
- If no budget exists for current month: renders "No budget set" with a "Create Budget" link to `/budgets`
- Shows top 5 categories by spending-to-limit ratio as `BudgetProgressBar` atoms
- If more than 5 categories, shows "+N more" link to `/budgets`
- Uses existing `getBudgetForMonth` + `getBudgetSpending` from `queries/budgets.ts`

---

## CSV Export

### API Route: `app/api/export/transactions/route.ts`

GET route handler. Not a server action — server actions can't stream file responses.

**Authentication:** First line of the handler must call `await getHouseholdId()` — this throws/redirects if unauthenticated, preventing unauthorized data access. All queries are scoped to the authenticated household.

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
| Amount | `-(transaction.normalizedAmount) / 100` | Dollars with 2 decimals. **Negated from DB value** so expenses appear negative (e.g., `-12.50`) and income positive (e.g., `500.00`), matching standard bank statement convention. |
| Category | `category.name` | string |
| Category Group | `categoryGroup.name` | string |
| Notes | `transaction.notes` | string |
| Original Description | `transaction.originalName` | string (field is `originalName` in schema, not `originalDescription`) |

**Implementation:** Uses `baseTransactionQuery` from `queries/transactions.ts` with the same joins. No streaming needed for personal finance volumes (<100k rows) — build full CSV string in memory, return as Response.

**UI:** Add an export button (download icon) to the existing `transaction-filters.tsx` molecule. Uses an `<a>` element with `href` pointing to the API route (constructed from current searchParams) and `download` attribute. NOT `window.location.assign` — `<a download>` preserves native browser download UX. Button is visually separated from filter controls via `ml-auto` to avoid confusion with filters.

---

## Data Flow

### Filter → URL → Server → Client

```
User changes filter in report-filter-bar
  → useSearchParamFilters hook calls router.push with updated searchParams
  → page.tsx (server component) re-renders
  → reads searchParams, calls report query for active tab only
  → passes data as props to active tab organism (via ReportTabs client wrapper)
  → organism renders chart atom + data table
```

URL is the single source of truth. Every report state is bookmarkable and shareable.

### Tab Switching

`?tab=spending|income-expense|trends|net-worth`. `ReportTabs` client component reads `useSearchParams()` for controlled `value`, handles `onValueChange` via `router.push`. Changing tabs preserves all other filters in the URL. Default tab is `spending`.

### Comparison Period

Automatic based on date range:
- **Preset ranges (1M/3M/6M/1Y):** Month-aligned comparison. "3M" → prior 3 full calendar months.
- **Custom date ranges:** Shift by exact day count.
- **"All time":** No comparison shown.

`comparison-badge.tsx` renders both the percentage delta AND the comparison period dates (e.g., "+12% vs Oct 1 – Dec 31") so users can verify the comparison window.

### Saved Reports

```
Save: Click save in saved-report-picker → name input dialog (Radix-safe composition)
  → saveReport action → persists {name, reportType, filters as JSON}
Load: Pick from dropdown → router.push with stored filters → standard re-render
Delete: Click delete on picker item → deleteReport action → remove from list
```

Saved reports are stored searchParams — no special loading path. Loading a saved report just pushes its filters to the URL.

### CSV Export

```
Click export <a download> button on transactions page filter bar
  → browser GETs /api/export/transactions?from=...&to=...&account=...
  → Route handler: await getHouseholdId() (auth check)
  → Calls baseTransactionQuery with filters, scoped to household
  → Builds CSV string with UTF-8 BOM
  → Returns Response with Content-Disposition: attachment
  → Browser downloads file
```

---

## Testing

### Integration Tests: `tests/integration/report-queries.test.ts` (~8 tests)

1. Spending by category returns correct totals grouped by category
2. Spending comparison period calculates correct deltas vs prior period
3. Income vs expense uses `normalizedAmount` sign (not `categories.isIncome`), correctly handles uncategorized transactions
4. Category trends groups by month + category with correct totals
5. Account filter narrows report results to selected accounts only
6. Transfers excluded from spending reports — both `isTransfer = true` AND non-null `transferPairId` rows omitted
7. Pending transactions excluded from all report queries
8. Split transactions attributed to their split categories, not parent category (spending + trends)

### Integration Tests: `tests/integration/report-actions.test.ts` (~3 tests)

1. Save report persists filters JSON and loads back with correct shape
2. Delete report with ownership verification (can't delete another household's report)
3. Saved reports scoped to household (isolation test)

### Unit Tests: `src/lib/date-utils.test.ts` (~4 property-based tests)

1. `rangeToDateBounds` returns valid date strings for all preset values
2. `monthBounds` returns first and last day for any valid YYYY-MM input (property: last day is always valid calendar date)
3. `shiftDateRange` with preset ranges produces month-aligned periods
4. `shiftDateRange` with custom ranges produces same-length periods (property-based with fast-check, including Feb edge cases and year-boundary crossings)

### Integration Tests: `tests/integration/csv-export.test.ts` (~4 tests)

1. Unauthenticated request returns 401/redirect (no data exposure)
2. Export respects active filters (date range, account) — filtered-out transactions not in CSV
3. Amounts exported as negated dollars: a $12.50 expense (normalizedAmount=1250) appears as `-12.50` in CSV
4. UTF-8 BOM present as first 3 bytes of response

### No Tests For

- Chart rendering atoms (declarative Recharts config)
- `loading.tsx` / `error.tsx` (declarative markup)
- Tab switching (URL-driven, no testable logic)
- Comparison badge (pure display)

**Total: ~19 tests** (8 report queries + 3 report actions + 4 date utils + 4 CSV export)

---

## Files Summary

### New Files

| File | Type |
|------|------|
| `src/queries/reports.ts` | Report aggregation queries |
| `src/queries/saved-reports.ts` | Saved report CRUD queries |
| `src/actions/reports.ts` | Server actions for saved report mutations only |
| `src/db/schema/reports.ts` | `saved_reports` Drizzle schema |
| `src/hooks/use-search-param-filters.ts` | Shared URL filter manipulation hook |
| `src/lib/chart-colors.ts` | Shared chart color palette constant |
| `src/components/atoms/spending-chart.tsx` | Donut/bar chart renderer (no toggle state) |
| `src/components/atoms/cash-flow-bar-chart.tsx` | Grouped bar chart renderer (uses `CashFlowRow` type) |
| `src/components/atoms/net-worth-area-chart.tsx` | Area + line chart renderer |
| `src/components/atoms/trend-line-chart.tsx` | Multi-series line chart |
| `src/components/molecules/report-filter-bar.tsx` | Date/account/category filter bar with multi-select |
| `src/components/molecules/comparison-badge.tsx` | Percentage change + comparison period display |
| `src/components/organisms/report-tabs.tsx` | Client wrapper for shadcn Tabs with URL-driven state |
| `src/components/organisms/saved-report-picker.tsx` | Saved report dropdown with save/load/delete (organism) |
| `src/components/organisms/report-spending.tsx` | Spending tab |
| `src/components/organisms/report-income-expense.tsx` | Income vs Expense tab |
| `src/components/organisms/report-trends.tsx` | Trends tab |
| `src/components/organisms/report-net-worth.tsx` | Net Worth tab |
| `src/components/organisms/widgets/budget-progress.tsx` | Budget widget (replaces placeholder) |
| `src/app/(dashboard)/reports/page.tsx` | Reports page |
| `src/app/(dashboard)/reports/loading.tsx` | Loading skeleton |
| `src/app/(dashboard)/reports/error.tsx` | Error boundary |
| `src/app/api/export/transactions/route.ts` | CSV export endpoint (authenticated) |
| `tests/integration/report-queries.test.ts` | Report query tests |
| `tests/integration/report-actions.test.ts` | Saved report action tests |
| `tests/integration/csv-export.test.ts` | CSV export tests |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/date-utils.ts` | Add `rangeToDateBounds`, `monthBounds`, `shiftDateRange`, `comparisonLabel` |
| `src/lib/date-utils.test.ts` | Property-based tests for new functions |
| `src/queries/dashboard.ts` | Import `rangeToDateBounds` from `date-utils.ts`, remove private copy. Add `isHidden = false` filter to `getNetWorthHistory`. |
| `src/db/schema/index.ts` | Export `saved_reports` schema |
| `src/components/organisms/widgets/spending-by-category.tsx` | Extract chart rendering to `atoms/spending-chart.tsx`, keep toggle state + month nav |
| `src/components/organisms/widgets/cash-flow-chart.tsx` | Extract chart rendering to `atoms/cash-flow-bar-chart.tsx`, keep as thin wrapper |
| `src/components/organisms/widgets/net-worth-chart.tsx` | Extract chart rendering to `atoms/net-worth-area-chart.tsx`, keep range selector |
| `src/components/organisms/widgets/registry.ts` | Replace budgets placeholder with real `BudgetProgressWidget` |
| `src/components/organisms/dashboard-grid.tsx` | Add `budget-progress` case to `renderWidget` |
| `src/components/molecules/transaction-filters.tsx` | Add CSV export `<a download>` button (right-aligned with `ml-auto`). Refactor to use `useSearchParamFilters` hook. |
| `src/components/organisms/sidebar-nav.tsx` | Add "Reports" link |
