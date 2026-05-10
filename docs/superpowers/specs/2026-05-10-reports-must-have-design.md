# Reports Must-Have Features — Design Spec

**Date:** 2026-05-10
**Scope:** Complete the must-have report features identified in `docs/reports-feature-research.md`, plus targeted query layer fixes.

**Reviewed by:** Staff engineer (architecture), Plaid/fintech engineer (financial accuracy), Senior frontend engineer (component patterns), Frontend design (visual/UX).

---

## 1. Query Layer Refactoring

Fix bugs, eliminate duplication, normalize interfaces. All downstream features depend on correct query results.

### 1.1 Security fix — `deleteReport` scoping

`src/actions/reports.ts`: the existence check uses `scoped.where`, but the actual DELETE is a bare `eq(savedReports.id, reportId)` without the `householdId` guard. Fix: collapse to a single `db.delete(...).where(scoped.where(savedReports, eq(savedReports.id, reportId)))` — no separate existence check, check affected row count instead.

### 1.2 Extract shared spending aggregation

Move `aggregateSpending()` + `enrichSpendingMap()` from `src/queries/reports.ts` into `src/lib/spending-helpers.ts`. Both `getSpendingByCategory` (reports) and `getMonthlySpending` (dashboard) call it. Dashboard gains split-transaction awareness for free.

Exported functions:
- `aggregateSpending(householdId, filters, db): Map<string, number>` — split-aware spending by categoryId
- `enrichSpendingMap(spending, db): SpendingChartItem[]` — resolves category names and groups

### 1.3 Unify income classification

Both `getCashFlow` (dashboard) and `getIncomeVsExpense` (reports) must use the `isIncome` flag, not sign-based classification.

Add to `src/lib/query-helpers.ts`:
```ts
getIncomeCategoryIds(db: LedgrDb): Set<string>
```

Both queries call this once per request instead of independently resolving income categories.

**Important:** When summing income transactions, always use `Math.abs(normalizedAmount)` or `ABS()` in SQL. The `normalizedAmount` for income is negative (Plaid positive = debit, flip = negative). Failing to use absolute value produces negative income totals. This applies to all new queries: `getIncomeExpenseByCategory`, `getCashFlowSankey`, `getSafeToSpend`.

### 1.4 Fix `getCashFlow` transfer filtering

Add `eq(transactions.isTransfer, false)` and `isNull(transactions.transferPairId)` conditions to `getCashFlow` in `src/queries/dashboard.ts`, matching what `getIncomeVsExpense` already does. Both conditions are required — one without the other misses half-matched transfer pairs.

### 1.5 Normalize `SpendingChart` input type

Define a single interface in `src/components/atoms/spending-chart.tsx`:
```ts
interface SpendingChartItem {
  id: string | null;
  name: string;
  value: number;
}
```

Both report organism and dashboard widget map to this shape before passing to the atom. Remove the `MonthlySpendingRow | ChartDataItem[]` union and the runtime `"categoryName" in item` duck-type check.

### 1.6 Delete redundant widget wrapper

Delete `src/components/organisms/widgets/cash-flow-chart.tsx`. Call `CashFlowBarChart` atom directly from `src/components/organisms/dashboard-grid.tsx`.

---

## 2. Filtered Totals

Show aggregate numbers at the top of every report tab.

### 2.1 New atom: `ReportSummaryBar`

Location: `src/components/atoms/report-summary-bar.tsx`

Props:
```ts
interface SummaryItem {
  label: string;
  value: number;
  format?: "currency" | "number" | "percent";
  color?: "default" | "income" | "expense" | "dynamic" | "safe-to-spend";
  secondaryLabel?: string; // e.g. "(current month)" or "+12.3%"
}

interface ReportSummaryBarProps {
  items: SummaryItem[];
}
```

Renders a horizontal flex row of stat cards. Pure display, no logic. Color semantics:
- `"dynamic"` = green if positive, red if negative
- `"safe-to-spend"` = green (>20% of income), yellow (5-20%), red (<5% or negative)

Uses `centsToDisplay` for currency format. `secondaryLabel` renders as muted text below the value (for Net Worth change %, Safe to Spend month label).

### 2.2 Cards per tab

| Tab | Cards |
|-----|-------|
| Spending | Total Spent, # Categories, Top Category (name + amount) |
| Income vs Expense | Total Income, Total Expenses, Net (uses `ReportSummaryBar` for visual consistency, replaces current inline cards) |
| Trends | Total Spent (full period), Monthly Average |
| Net Worth | Current Net Worth, Change over period (absolute + % as secondaryLabel) |
| Cash Flow | Total Income, Recurring Bills, Spent So Far, Safe to Spend |

### 2.3 Data flow

No new queries. Each report organism computes summary values from the data it already receives and passes them to `ReportSummaryBar`.

---

## 3. Chart-to-Transaction Drill-Down

Click any chart element to see the underlying transactions in a side panel.

### 3.1 New molecule: `TransactionListPanel`

Location: `src/components/molecules/transaction-list-panel.tsx`

Receives `TransactionRow[]`, groups by date internally, renders using the existing `TransactionRow` molecule for each row. Classified as a molecule (not atom) because it performs date-grouping logic.

Props:
```ts
interface TransactionListPanelProps {
  rows: TransactionRow[];
}
```

No bulk actions, no checkboxes, no pagination. Scrollable with max height.

### 3.2 Drill-down Sheet

Location: `src/components/organisms/drill-down-sheet.tsx`

A shadcn `Sheet` (right side drawer):
- **Header:** breadcrumb showing context ("Spending > Groceries" or "Cash Flow > Salary") + total amount
- **Body:** `TransactionListPanel` with fetched transactions. Shows loading skeleton while fetching. When loaded, shows count: "Showing 50 of 127 transactions" if capped.
- **Footer:** "View all in Transactions" link → `/transactions?category=X&from=Y&to=Z`

Props:
```ts
interface DrillDownFilter {
  categoryId?: string;
  categoryName: string;
  month?: string;
  type?: "income" | "expense";
  tabContext: string; // e.g. "Spending", "Cash Flow" — for breadcrumb
}

interface DrillDownSheetProps {
  filter: DrillDownFilter | null;
  dateFrom: string;
  dateTo: string;
  onClose: () => void;
}
```

**Data fetching pattern:** Uses `useTransition` + `startTransition` to call the server action, matching the existing `startNwTransition` pattern in `dashboard-grid.tsx`. This handles rapid clicks between categories without stale-closure bugs — the latest transition wins.

### 3.3 New server action

Location: `src/actions/reports.ts`

```ts
getDrillDownTransactions(filters: {
  categoryId?: string;
  dateFrom: string;
  dateTo: string;
  type?: "income" | "expense";
}): Promise<{ rows: TransactionRow[]; totalCount: number }>
```

Thin wrapper around existing `getTransactions()` from `src/queries/transactions.ts`. Adds auth + scoping. Returns first 50 rows + total count (for "Showing X of Y" display). The "View all" link handles overflow.

### 3.4 Chart onClick wiring

| Chart | Click target | Drill-down filter |
|-------|-------------|-------------------|
| Spending donut | Pie slice | `categoryId` from slice |
| Spending bar | Bar segment | `categoryId` from bar |
| Spending table | Table row | `categoryId` from row |
| Income vs Expense bar | Bar segment | `month` + income/expense type |
| Trends line | Line data point | `categoryId` + `month` |
| Sankey node | Node rectangle | `categoryId` + income/expense type |
| Net Worth | No drill-down | N/A (balance history, not transactions) |

Each chart atom/molecule gets an optional `onItemClick?: (item: { id: string | null; name: string }) => void` prop. The atom passes the clicked element's data through. The parent organism translates to a `DrillDownFilter`.

### 3.5 State management

Drill-down state lives in each individual report organism (`ReportSpending`, `ReportIncomeExpense`, `ReportTrends`, `ReportCashFlow`) as `useState<DrillDownFilter | null>(null)`. Each organism renders its own `DrillDownSheet`. This avoids unnecessary re-renders of all tab contents when drill-down opens/closes and keeps organisms self-contained. No URL params — drill-down is ephemeral.

---

## 4. Income vs Expense Improvements

### 4.1 Fix `getIncomeVsExpense` category filter

Add the missing `categoryIds` condition to the query in `src/queries/reports.ts`:
```ts
if (filters.categoryIds?.length) {
  conditions.push(inArray(transactions.categoryId, filters.categoryIds));
}
```

### 4.2 New query: `getIncomeExpenseByCategory`

Location: `src/queries/reports.ts`

```ts
interface IncomeExpenseCategoryRow {
  categoryId: string;
  categoryName: string;
  isIncome: boolean;
  total: number;
  monthlyAverage: number;
  percentOfTotal: number;
}

getIncomeExpenseByCategory(
  householdId: string,
  filters: ReportFilters,
  db?: LedgrDb
): IncomeExpenseCategoryRow[]
```

Groups transactions by category, separates income vs expense using `getIncomeCategoryIds`. Uses `ABS(normalizedAmount)` for income rows to produce positive totals. Computes monthly average from the number of distinct months in the date range (months with zero transactions are counted — this is the "calendar months in range" definition, not "months with activity"). `percentOfTotal` is relative to total income or total expenses respectively.

### 4.3 Trendline on `CashFlowBarChart`

**Migration required:** Change `<BarChart>` to `<ComposedChart>` in `cash-flow-bar-chart.tsx`. Recharts does not support `<Line>` inside `<BarChart>`. Update imports accordingly.

Add a Recharts `<Line>` for the `net` field overlaid on existing bars.

New prop: `showTrendline?: boolean` — defaults to `false`. Reports page passes `true`, dashboard widget keeps `false`.

Line config: `type="monotone"`, `stroke={PRIMARY_COLOR}`, `strokeWidth={2}`, `dot={false}`.

### 4.4 New molecule: `IncomeExpenseCategoryTable`

Location: `src/components/molecules/income-expense-category-table.tsx`

Props:
```ts
interface IncomeExpenseCategoryTableProps {
  data: IncomeExpenseCategoryRow[];
  onCategoryClick?: (categoryId: string, isIncome: boolean) => void;
}
```

Two-section table with visual separator and section labels ("Income Sources" / "Expense Categories"):
- **Income sources** section — rows sorted by total descending
- **Expense categories** section — rows sorted by total descending
- Columns: Category, Total, Monthly Avg, % of Total (with inline spark bar for visual scanning)
- Each row is clickable → calls `onCategoryClick` for drill-down. Hover state with subtle right-arrow indicator for drill-down affordance.

### 4.5 Updated `ReportIncomeExpense` organism

Composes:
1. `ReportSummaryBar` — replaces current inline summary cards
2. `CashFlowBarChart` (now `ComposedChart` internally) with `showTrendline={true}`
3. `IncomeExpenseCategoryTable` below the chart

Page fetches both `getIncomeVsExpense` (chart) and `getIncomeExpenseByCategory` (table) when the income-expense tab is active. Both fetches start concurrently (not sequentially).

---

## 5. Sankey Diagram + Cash Flow Tab

### 5.1 New dependency

```bash
pnpm add d3-sankey && pnpm add -D @types/d3-sankey
```

### 5.2 New query: `getCashFlowSankey`

Location: `src/queries/reports.ts`

```ts
interface SankeyNode {
  id: string;
  name: string;
  type: "income" | "expense" | "savings";
}

interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

getCashFlowSankey(
  householdId: string,
  filters: ReportFilters,
  db?: LedgrDb
): { nodes: SankeyNode[]; links: SankeyLink[] }
```

**Two-column layout (corrected from review):** Each income category becomes a left-side node with its actual total as width. Each expense category becomes a right-side node with its actual total as width. Links connect each income node directly to each expense node — link values are computed so that each income node's outgoing links sum to exactly its total, and each expense node's incoming links sum to exactly its total.

When total income > total expenses, add an implicit "Savings" node on the right side to absorb the surplus. When total expenses > total income (deficit), add an implicit "Over Budget" node on the left side. This ensures the Sankey balances visually.

Uses `ABS(normalizedAmount)` for income rows. Filters out zero-value nodes and links. Respects `ReportFilters`.

### 5.3 New molecule: `SankeyChart`

Location: `src/components/molecules/sankey-chart.tsx`

Classified as molecule (not atom) because it runs d3-sankey layout computation and manages hover/tooltip state.

Props:
```ts
interface SankeyChartProps {
  nodes: SankeyNode[];
  links: SankeyLink[];
  onNodeClick?: (nodeId: string, type: "income" | "expense" | "savings") => void;
  height?: number;
}
```

Implementation:
- Uses `d3-sankey` `sankey()` for layout computation only (node positions, link paths)
- Renders with React SVG elements — no direct DOM manipulation
- Income nodes on left (sorted by value, largest on top), expense nodes on right (sorted by value, largest on top)
- Node colors: income = `INCOME_COLOR`, expenses = `CHART_COLORS` palette, savings = a muted green
- Link fill: gradient from source to target color, opacity 0.15 default, 0.4 on hover (lighter than originally spec'd — prevents visual clutter with many categories)
- Minimum node height of 8px so small categories remain visible and clickable
- Hover tooltip: "Source → Target: $X,XXX"
- Click node → `onNodeClick` for drill-down
- Responsive via SVG `viewBox` + container div

### 5.4 New 5th tab: Cash Flow

Add "Cash Flow" tab to `ReportTabs`. Tab order: **Spending | Income vs Expense | Cash Flow | Trends | Net Worth** (grouping flow-related tabs together).

**Mobile responsive:** On screens < 640px, the tab bar becomes horizontally scrollable to accommodate 5 tabs without wrapping.

### 5.5 New organism: `ReportCashFlow`

Location: `src/components/organisms/report-cash-flow.tsx`

Composes:
1. `ReportSummaryBar` — Total Income, Recurring Bills, Spent So Far, Safe to Spend
2. `SankeyChart` — primary visualization
3. `CashFlowBarChart` with `showTrendline={true}` — secondary view below Sankey

Props: sankey data + income/expense data (for bar chart) + safe to spend data.

### 5.6 Drill-down

`onNodeClick` in `SankeyChart` → triggers the same `DrillDownSheet` from Section 3, filtered to the clicked category. "Savings" node has no drill-down (it's an implied surplus, not backed by transactions).

### 5.7 Page-level data fetching

Cash Flow tab requires three data sources: `getCashFlowSankey`, `getSafeToSpend`, and `getIncomeVsExpense` (for the bar chart). All three must be fetched concurrently using `Promise.all` to avoid sequential waterfalls:

```ts
case "cash-flow":
  [sankeyData, safeToSpendData, cashFlowBarData] = await Promise.all([
    getCashFlowSankey(householdId, filters),
    getSafeToSpend(householdId),
    getIncomeVsExpense(householdId, filters),
  ]);
  break;
```

---

## 6. Safe to Spend

### 6.1 New query: `getSafeToSpend`

Location: `src/queries/reports.ts`

```ts
interface SafeToSpendResult {
  monthlyIncome: number;
  recurringExpenses: number;
  discretionarySpent: number;
  safeToSpend: number;
}

getSafeToSpend(
  householdId: string,
  db?: LedgrDb
): SafeToSpendResult
```

Calculation:
```
safeToSpend = monthlyIncome - recurringExpenses - discretionarySpent
```

- **monthlyIncome:** sum of `ABS(normalizedAmount)` for transactions in current month where category `isIncome = true`. Includes both posted and pending transactions (prevents jarring zero/negative Safe to Spend when a paycheck hasn't settled yet).
- **recurringExpenses:** For each active recurring transaction (`recurring_transactions.isActive = true`, expense type):
  - If a matching transaction has already posted this month (joined via `recurringTransactionId`), use the actual posted amount
  - If not yet posted, use `COALESCE(averageAmount, lastAmount, 0)` as the projected amount
  - This prevents double-counting and uses real data when available
- **discretionarySpent:** sum of non-recurring expenses posted this month — transactions where `recurringTransactionId IS NULL`, category is not income, `isTransfer = false`, AND `transferPairId IS NULL` (both transfer conditions required to catch half-matched pairs)

### 6.2 Display

4th card in the Cash Flow tab's `ReportSummaryBar`.

Color treatment for the Safe to Spend card (using `"safe-to-spend"` color):
- Green: > 20% of income remaining
- Yellow: 5–20% remaining
- Red: < 5% or negative

### 6.3 Current-month scope

Safe to Spend always calculates for the current month regardless of the tab's selected date range. When the date range is not the current month, the card still appears with `secondaryLabel: "(current month)"`.

---

## File Changes Summary

### New files (8)
| File | Type | Purpose |
|------|------|---------|
| `src/lib/spending-helpers.ts` | Utility | Shared `aggregateSpending` + `enrichSpendingMap` |
| `src/components/atoms/report-summary-bar.tsx` | Atom | Stat card row for filtered totals |
| `src/components/molecules/transaction-list-panel.tsx` | Molecule | Read-only date-grouped transaction list |
| `src/components/molecules/sankey-chart.tsx` | Molecule | d3-sankey layout + React SVG rendering |
| `src/components/organisms/drill-down-sheet.tsx` | Organism | Side panel for transaction drill-down |
| `src/components/molecules/income-expense-category-table.tsx` | Molecule | Two-section income/expense category breakdown |
| `src/components/organisms/report-cash-flow.tsx` | Organism | Cash Flow tab: Sankey + bar chart + safe to spend |

### Modified files (~13)
| File | Changes |
|------|---------|
| `src/actions/reports.ts` | Security fix on `deleteReport` + `getDrillDownTransactions` action |
| `src/queries/reports.ts` | Extract helpers out, add `getIncomeExpenseByCategory`, `getCashFlowSankey`, `getSafeToSpend`, fix `getIncomeVsExpense` categoryIds |
| `src/queries/dashboard.ts` | Use shared `aggregateSpending`, use `getIncomeCategoryIds`, fix transfer filtering in `getCashFlow` |
| `src/lib/query-helpers.ts` | Add `getIncomeCategoryIds` |
| `src/components/atoms/spending-chart.tsx` | Normalized `SpendingChartItem` type + `onItemClick` prop |
| `src/components/atoms/cash-flow-bar-chart.tsx` | Migrate `BarChart` → `ComposedChart` + `showTrendline` prop + `<Line>` overlay |
| `src/components/organisms/report-tabs.tsx` | 5th tab (Cash Flow), reordered tabs, mobile scrollable tab bar |
| `src/components/organisms/report-spending.tsx` | `ReportSummaryBar` + drill-down state + `DrillDownSheet` |
| `src/components/organisms/report-income-expense.tsx` | `ReportSummaryBar` + trendline + category table + drill-down state |
| `src/components/organisms/report-trends.tsx` | `ReportSummaryBar` + drill-down state + `DrillDownSheet` |
| `src/components/organisms/report-net-worth.tsx` | `ReportSummaryBar` |
| `src/components/organisms/dashboard-grid.tsx` | Remove `CashFlowChart` widget import, use atom directly |
| `src/app/(dashboard)/reports/page.tsx` | Fetch data for Cash Flow tab + sankey + safe to spend + income/expense categories, use Promise.all for concurrent fetches |

### Deleted files (1)
| File | Reason |
|------|--------|
| `src/components/organisms/widgets/cash-flow-chart.tsx` | One-line passthrough wrapper, no value |

---

## Architecture Principles Applied

- **Atomic design:** atoms are pure display (charts, stat bars), molecules add interaction logic or data transformation (sankey layout, date grouping, category table), organisms own composition and domain orchestration (report tabs, drill-down sheet)
- **Clean data flow:** server component fetches → organisms shape → molecules/atoms render. No queries in components.
- **DRY where it counts:** shared `aggregateSpending`, `getIncomeCategoryIds`, `ReportSummaryBar` reused across all tabs
- **No overengineering:** no state management library, no abstraction layers beyond what's needed. URL state for filters, useState for ephemeral drill-down. `useTransition` for server action calls.
- **Existing patterns preserved:** `db` parameter injection for testability, `scopedQuery` for tenant isolation, `ReportFilters` interface for consistency
- **Financial accuracy:** `ABS()` for all income amounts, both transfer conditions for filtering, actual-before-projected for recurring expenses, pending income included in Safe to Spend
