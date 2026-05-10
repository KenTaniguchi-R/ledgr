# Phase 7 — Budgets Design Spec

## Overview

YNAB-style inline-edit budget table for Ledgr. Users set spending limits per category, view progress bars, and track remaining amounts. Supports fixed vs flex budget types and unbudgeted spending visibility.

## Data Layer

### Existing Schema (no changes needed)

`budgets`: `id`, `household_id FK`, `month TEXT (YYYY-MM)`, `type ENUM(category|flex)`, timestamps. Unique on `(household_id, month)`.

`budgetCategories`: `id`, `budget_id FK`, `category_id FK`, `limit_amount INT (cents)`, `rollover BOOL`, `is_fixed BOOL`, `created_at`. Unique on `(budget_id, category_id)`.

Rollover is deferred — flag exists but logic is not implemented in this phase.

### Queries (`src/queries/budgets.ts`)

#### `getBudgetForMonth(householdId, month, db)`

Returns:

```ts
interface UnbudgetedCategory {
  categoryId: string;
  categoryName: string;
  groupName: string;
  spent: number; // cents
}

interface BudgetCategoryRow {
  budgetCategoryId: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string | null;
  limitAmount: number; // cents
  spent: number; // cents
  remaining: number; // cents (limit - spent)
  isFixed: boolean;
}

interface BudgetGroup {
  groupId: string;
  groupName: string;
  groupIcon: string | null;
  categories: BudgetCategoryRow[];
  totalBudgeted: number; // cents
  totalSpent: number; // cents
}

interface BudgetMonth {
  budget: { id: string; month: string; type: "category" | "flex" } | null;
  groups: BudgetGroup[];
  unbudgeted: { spent: number; categories: UnbudgetedCategory[] };
  summary: { totalBudgeted: number; totalSpent: number; totalRemaining: number };
}
```

**Spending aggregation logic:**
- Filter transactions: `date BETWEEN '{month}-01' AND '{month}-{lastDay}'`, `is_transfer = false`, `pending = false`, `deleted_at IS NULL`
- For transactions without splits: group `SUM(normalized_amount)` by `category_id`
- For split transactions: sum from `transactionSplits` per `category_id` instead of the parent's category
- All amounts in cents (integers)
- Scoping: `scopedQuery(householdId, db)` with `scoped.where(transactions, ...)`

#### `getBudgetSpending(householdId, month, db)`

Pure spending aggregation helper used internally by `getBudgetForMonth`. Returns `Map<categoryId, spentCents>`.

### Actions (`src/actions/budgets.ts`)

All follow existing pattern: `"use server"` → Zod validation → `getHouseholdId()` → scoped ownership check → mutate → `revalidatePath("/budgets")` → return `{ success: true } | { error: string }`.

#### `createBudget(month: string)`

Creates a `budgets` row for the given month. Idempotent — returns existing budget if one already exists for that household+month.

Input validation: `month` matches `YYYY-MM` format.

#### `setBudgetCategory(budgetId: string, categoryId: string, limitAmount: number)`

Upserts a `budgetCategories` row. Sets or updates the spending limit for a category within a budget. `limitAmount` in cents.

Ownership check: verify `budgetId` belongs to the user's household before mutating.

#### `removeBudgetCategory(budgetId: string, categoryId: string)`

Deletes the `budgetCategories` row. The category reverts to "Everything Else" (unbudgeted).

#### `copyBudgetFromMonth(sourceMonth: string, targetMonth: string)`

Creates a budget for `targetMonth`, copies all `budgetCategories` rows from the source month with the same `limit_amount` and `is_fixed` values. If target month budget already exists, returns error.

#### `updateBudgetType(budgetId: string, type: "category" | "flex")`

Updates the `budgets.type` field. Used to toggle between category and flex view modes.

#### `toggleFixedCategory(budgetCategoryId: string)`

Toggles the `is_fixed` flag on a `budgetCategories` row. Used in both budget types for visual grouping.

## Component Architecture (Atomic Design)

### Atoms

**`BudgetProgressBar`** (`src/components/atoms/budget-progress-bar.tsx`)
- Pure display, no `"use client"`
- Props: `spent: number`, `limit: number` (both cents), `className?: string`
- Renders horizontal bar with percentage fill
- Color thresholds: green (<80%), yellow (80-100%), red (>100%)
- Shows remaining amount as text via `centsToDisplay()`

### Molecules

**`BudgetCategoryRow`** (`src/components/molecules/budget-category-row.tsx`)
- `"use client"` — inline editing + server action calls
- Grid row: category icon + name | inline budget input | spent | remaining | progress bar
- Budget input: controlled `<input>` formatted as currency, blur-to-save via `setBudgetCategory` with `useTransition`
- Spent amount uses existing `AmountDisplay` atom
- Remove budget: small X button → `removeBudgetCategory`
- Empty input = remove budget (reverts to unbudgeted)

**`BudgetSummaryBar`** (`src/components/molecules/budget-summary-bar.tsx`)
- No `"use client"` — pure display
- Props: `summary`, `budgetType`
- Category mode: Total Budgeted | Total Spent | Remaining (color-coded)
- Flex mode: Fixed Expenses | Variable Budgeted | Left to Spend
- Uses `BalanceDisplay` atom for amounts
- Remaining: green if positive, red if negative

**`BudgetMonthNav`** (`src/components/molecules/budget-month-nav.tsx`)
- `"use client"` — URL navigation
- `< May 2026 >` arrow buttons
- Updates `?month=2026-05` search param via `useRouter`
- Defaults to current month if no param

**`BudgetEmptyState`** (`src/components/molecules/budget-empty-state.tsx`)
- `"use client"` — button actions
- Shown when `budget` is null for the selected month
- Primary CTA: "Create Budget" → `createBudget(month)`
- Secondary: "Copy from [Previous Month]" → `copyBudgetFromMonth(prev, current)` — only shown if previous month has a budget

### Organisms

**`BudgetGroupSection`** (`src/components/organisms/budget-group-section.tsx`)
- `"use client"` — collapsible state
- One per category group
- Collapsible header: group icon + name + group totals (budgeted/spent)
- Renders `BudgetCategoryRow` for each category in the group
- Fixed groups render first with muted background styling

**`BudgetTable`** (`src/components/organisms/budget-table.tsx`)
- `"use client"` — coordinates all budget interactions
- Layout order:
  1. `BudgetMonthNav`
  2. `BudgetSummaryBar`
  3. Budget type toggle (category ↔ flex)
  4. Fixed `BudgetGroupSection`s (collapsed by default)
  5. Variable `BudgetGroupSection`s (expanded)
  6. "Everything Else" read-only section (unbudgeted spending)
- Handles copy-from-month flow
- Calls `router.refresh()` after mutations

### Page Files

**`/app/(dashboard)/budgets/page.tsx`** — async server component
- Reads `searchParams.month` (defaults to current YYYY-MM)
- Calls `getBudgetForMonth(householdId, month)`
- Passes data to `BudgetTable`

**`/app/(dashboard)/budgets/loading.tsx`** — skeleton with shimmer bars

**`/app/(dashboard)/budgets/error.tsx`** — error boundary with retry button

### Navigation

Add "Budgets" entry to `SidebarNav` (`src/components/organisms/sidebar-nav.tsx`) with `Wallet` Lucide icon, positioned after Transactions.

## Fixed vs Flex Budget Type

Both modes use the same `BudgetTable` and same underlying data. Differences:

**Category mode (default):**
- All groups shown in a flat grouped list
- Fixed categories at top (collapsed), variable below
- Summary: Total Budgeted | Total Spent | Remaining

**Flex mode:**
- Same layout, but summary shifts focus
- Summary: Fixed Expenses (total) | Variable Budgeted | Left to Spend (income - fixed - variable)
- Emphasis on "how much flex money remains"

Toggle between modes via a segmented control in the page header. Updates `budgets.type` via `updateBudgetType` action.

The `is_fixed` flag on `budgetCategories` is togglable per-row via context menu or toggle icon. Determines which section a category appears in.

## Everything Else (Unbudgeted Spending)

Read-only section at the bottom of the budget table. Shows:
- Total unbudgeted spending for the month
- List of categories with spending but no budget limit set
- Each row: category name (with group), spent amount
- No progress bars (no limit to compare against)

Computed by: all categories with transactions in the month that are NOT in `budgetCategories` for the current budget. Transactions with `category_id IS NULL` (uncategorized) are included in "Everything Else" under an "Uncategorized" label.

## Testing

### Test Helpers (additions to `tests/integration/helpers.ts`)

- `insertBudget(db, householdId, overrides?)` → `{ budgetId }`
- `insertBudgetCategory(db, budgetId, categoryId, overrides?)` → `{ budgetCategoryId }`

### Integration Tests

**`tests/integration/budget-queries.test.ts`** (5 tests):
1. Returns null budget + empty groups for month with no budget
2. Returns budgeted categories with correct spent aggregation
3. Handles transaction splits in spending calculation
4. Excludes transfers, pending, and soft-deleted from spending
5. Unbudgeted spending appears in "Everything Else" with correct totals

**`tests/integration/budget-actions.test.ts`** (5 tests):
1. `createBudget` creates a budget, idempotent on repeat call
2. `setBudgetCategory` upserts limit amount correctly
3. `removeBudgetCategory` deletes the row
4. `copyBudgetFromMonth` copies all category limits to new month
5. Household isolation — cannot access another household's budget

### Unit Tests

- `src/lib/budget-utils.test.ts` — pure helpers if extracted (progress percentage, month arithmetic). ~2-3 tests.

### Not Tested

- Component files (declarative UI)
- Schema definitions
- Loading/error boundaries
