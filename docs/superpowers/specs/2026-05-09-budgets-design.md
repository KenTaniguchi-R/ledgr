# Phase 7 — Budgets Design Spec

## Overview

YNAB-style inline-edit budget table for Ledgr. Users set spending limits per category, view progress bars, and track remaining amounts. Supports fixed vs flex budget types and unbudgeted spending visibility.

## Data Layer

### Existing Schema (no changes needed)

`budgets`: `id`, `household_id FK`, `month TEXT (YYYY-MM)`, `type ENUM(category|flex)`, timestamps. Unique on `(household_id, month)`.

`budgetCategories`: `id`, `budget_id FK`, `category_id FK`, `limit_amount INT (cents)`, `rollover BOOL`, `is_fixed BOOL`, `created_at`. Unique on `(budget_id, category_id)`.

**Important:** `budgetCategories` has no `householdId` column. `scopedQuery.where()` cannot be used directly on this table. All ownership checks must JOIN through `budgets` to enforce household isolation.

Rollover is deferred — flag exists but logic is not implemented in this phase.

### Schema Migration

Add index on `transactionSplits.categoryId` for spending aggregation performance:

```sql
CREATE INDEX idx_splits_category ON transaction_splits(category_id);
```

### Spending Query Conventions

**Column:** Always use `normalized_amount` (not raw `amount`). This column has already been sign-normalized per account type by the sync pipeline.

**Expense filter:** `WHERE normalized_amount > 0` — only count debits/expenses. Income transactions (negative `normalized_amount`) must be excluded from spending calculations, otherwise paychecks would subtract from budget utilization.

**Standard exclusions:** `is_transfer = false`, `pending = false`, `deleted_at IS NULL`.

**Date filtering:** Use `date >= '{month}-01' AND date < '{nextMonth}-01'` (exclusive upper bound). The `date` field is Plaid's posted date stored as `TEXT`. `authorized_date` is not captured — transactions authorized near month boundaries may post in the adjacent month. This is a known Plaid limitation, documented here for awareness.

**Split transactions:** When a transaction has rows in `transactionSplits`, sum `transactionSplits.amount` per `category_id` instead of the parent transaction's `normalized_amount`. The parent transaction should be excluded from the per-category sum to avoid double-counting. Add an `insertTransactionSplit` factory helper for testing this path.

**Pending transactions:** Excluded from spending by design. Mid-month budget numbers may undercount by the sum of pending charges. The UI should not surface pending amounts in budget calculations — users can check the transactions page for pending detail.

**Division by zero:** When `limit_amount = 0`, the progress percentage is capped at 100%. The UI helper must handle `spent / 0` explicitly (return 100 if spent > 0, return 0 if spent === 0).

### Queries (`src/queries/budgets.ts`)

#### `getBudgetForMonth(householdId, month, db)`

Returns:

```ts
interface UnbudgetedCategory {
  categoryId: string;
  categoryName: string;
  groupName: string;
  spent: number; // cents, always positive (expenses only)
}

interface BudgetCategoryRow {
  budgetCategoryId: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string | null;
  limitAmount: number; // cents
  spent: number; // cents, always positive (expenses only)
  remaining: number; // cents (limit - spent, can be negative)
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
  lastSyncedAt: string | null; // ISO timestamp from plaid_items.updated_at
}
```

Transactions with `category_id IS NULL` (uncategorized) are included in "Everything Else" under an "Uncategorized" label.

`lastSyncedAt` is the most recent `plaid_items.updated_at` across all active items for the household. Surfaced in the UI as a freshness indicator.

#### `getBudgetSpending(householdId, month, db)`

Pure spending aggregation helper used internally by `getBudgetForMonth`. Returns `Map<categoryId, spentCents>`.

Query:
```sql
SELECT category_id, SUM(normalized_amount) as spent
FROM transactions
WHERE household_id = ?
  AND date >= '{month}-01' AND date < '{nextMonth}-01'
  AND normalized_amount > 0
  AND is_transfer = false
  AND pending = false
  AND deleted_at IS NULL
GROUP BY category_id
```

Plus a separate query for split transactions:
```sql
SELECT ts.category_id, SUM(ts.amount) as spent
FROM transaction_splits ts
JOIN transactions t ON ts.transaction_id = t.id
WHERE t.household_id = ?
  AND t.date >= '{month}-01' AND t.date < '{nextMonth}-01'
  AND t.is_transfer = false
  AND t.pending = false
  AND t.deleted_at IS NULL
GROUP BY ts.category_id
```

Merge both maps. For transactions that have splits, exclude the parent from the first query (to avoid double-counting).

### Actions (`src/actions/budgets.ts`)

All follow existing pattern: `"use server"` → Zod validation → `getHouseholdId()` → scoped ownership check → mutate → `revalidatePath("/budgets")` → return `{ success: true } | { error: string }`.

**Ownership enforcement:** Since `budgetCategories` has no `householdId` column, all actions that operate on `budgetCategories` must first verify the parent `budget` belongs to the household by joining `budgets` and checking `budgets.household_id` via `scopedQuery`. Never query `budgetCategories` directly for ownership.

#### `createBudget(month: string)`

Creates a `budgets` row for the given month. Idempotent — returns existing budget if one already exists for that household+month.

Input validation: `month` matches `YYYY-MM` format.

#### `setBudgetCategory(budgetId: string, categoryId: string, limitAmount: number)`

Upserts a `budgetCategories` row. Sets or updates the spending limit for a category within a budget. `limitAmount` in cents.

Ownership check: verify `budgetId` belongs to the user's household by querying `budgets` with `scopedQuery.where(budgets, eq(budgets.id, budgetId))`.

#### `removeBudgetCategory(budgetId: string, categoryId: string)`

Deletes the `budgetCategories` row. The category reverts to "Everything Else" (unbudgeted).

Ownership check: same JOIN through `budgets` as `setBudgetCategory`.

#### `copyBudgetFromMonth(sourceMonth: string, targetMonth: string)`

Creates a budget for `targetMonth`, copies all `budgetCategories` rows from the source month with the same `limit_amount` and `is_fixed` values. If target month budget already exists, merges: copies only categories not already present in the target (does not overwrite existing limits). This is consistent with `createBudget`'s idempotent behavior.

#### `updateBudgetType(budgetId: string, type: "category" | "flex")`

Updates the `budgets.type` field. Used to toggle between category and flex view modes.

Ownership check: same pattern — verify via `budgets.household_id`.

#### `toggleFixedCategory(budgetCategoryId: string)`

Toggles the `is_fixed` flag on a `budgetCategories` row.

Ownership check: JOIN `budgetCategories → budgets` to verify `budgets.household_id` matches the user's household.

## Component Architecture (Atomic Design)

### Money Utility Addition

Add `parseToCents(input: string): number | null` to `src/lib/money.ts`. Parses user-entered dollar strings (e.g., `"125.00"`, `"125"`, `"$125.00"`) into integer cents. Returns `null` for invalid input. Strips `$`, `,`, whitespace before parsing.

Add `budgetProgressPercent(spent: number, limit: number): number` to `src/lib/budget-utils.ts`. Returns 0-100+ percentage. Handles division by zero: returns 100 if `spent > 0 && limit === 0`, returns 0 if both are 0.

### Atoms

**`BudgetProgressBar`** (`src/components/atoms/budget-progress-bar.tsx`)
- Pure display, no `"use client"`
- Props: `spent: number`, `limit: number` (both cents), `className?: string`
- Uses shadcn `Progress` component internally
- Color thresholds: green (<80%), yellow (80-100%), red (>100%). For >100%, bar fills fully with red color.
- Uses `budgetProgressPercent()` for calculation

### Molecules

**`BudgetCategoryRow`** (`src/components/molecules/budget-category-row.tsx`)
- `"use client"` — inline editing + server action calls
- Uses real `<tr>/<td>` elements (not div grid) for a11y
- Grid columns: category icon + name | inline budget input | spent | remaining | progress bar
- **Inline edit behavior:**
  - Controlled `<Input>` (shadcn) showing dollar amount (e.g., `"125.00"`)
  - `$` prefix via absolute-positioned span in a relative wrapper
  - On blur: parse via `parseToCents()`, fire `setBudgetCategory` if value changed
  - Enter key: commit and blur (move focus to next row naturally)
  - Escape key: revert to `savedValue` ref and blur
  - `aria-label="Budget for {categoryName}"` on the input
- **Optimistic updates:** Follow `CategoryPicker` pattern — maintain `savedValue` ref as the server-committed value, update optimistically on blur, revert on error with `aria-live="polite"` error announcement
- Spent amount uses existing `AmountDisplay` atom
- Remove budget: small X button → `removeBudgetCategory`
- Empty input on blur = remove budget (reverts to unbudgeted)

**`BudgetSummaryBar`** (`src/components/molecules/budget-summary-bar.tsx`)
- No `"use client"` — pure display
- Props: `summary`, `budgetType`, `lastSyncedAt`
- Category mode: Total Budgeted | Total Spent | Remaining (color-coded)
- Flex mode: Fixed Expenses | Variable Budgeted | Left to Spend
- Uses `BalanceDisplay` atom for amounts
- Remaining: green if positive, red if negative
- Shows "Last synced X ago" freshness indicator from `lastSyncedAt`

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
- Copy CTA available even when target month has a budget (merge behavior, not error)

### Organisms

**`BudgetPageHeader`** (`src/components/organisms/budget-page-header.tsx`)
- `"use client"` — owns budget-level mutations
- Contains: `BudgetMonthNav`, budget type toggle (category ↔ flex), copy-from-month button
- Handles `updateBudgetType` and `copyBudgetFromMonth` actions
- Separated from `BudgetTable` to keep the table focused on display + row editing

**`BudgetGroupSection`** (`src/components/organisms/budget-group-section.tsx`)
- `"use client"` — collapsible state
- One per category group
- Collapsible header: group icon + name + group totals (budgeted/spent)
- Renders `BudgetCategoryRow` for each category in the group
- Fixed groups render first with muted background styling

**`BudgetTable`** (`src/components/organisms/budget-table.tsx`)
- `"use client"` — coordinates row rendering
- Uses real `<table>/<thead>/<tbody>` for a11y (screen readers announce row/column relationships)
- Layout order:
  1. `BudgetSummaryBar`
  2. Fixed `BudgetGroupSection`s (collapsed by default)
  3. Variable `BudgetGroupSection`s (expanded)
  4. "Everything Else" read-only section (unbudgeted spending)
- **Revalidation strategy:** Debounced `router.refresh()` — a `useRef` holding a `setTimeout` id that resets on each successful row save. Fires 1 second after the last edit. Prevents per-keystroke flickering during batch editing sessions.

### Page Files

**`/app/(dashboard)/budgets/page.tsx`** — async server component
- Reads `searchParams.month` (defaults to current YYYY-MM)
- Calls `getBudgetForMonth(householdId, month)`
- Renders `BudgetPageHeader` + `BudgetTable` (or `BudgetEmptyState` if no budget)

**`/app/(dashboard)/budgets/loading.tsx`** — skeleton using shadcn `Skeleton` component

**`/app/(dashboard)/budgets/error.tsx`** — error boundary with retry button

### Navigation

Add "Budgets" entry to `SidebarNav` (`src/components/organisms/sidebar-nav.tsx`) with `Wallet` Lucide icon, positioned after Transactions.

### shadcn Components to Add

```bash
pnpm dlx shadcn@latest add progress skeleton badge
```

- `Progress` — used by `BudgetProgressBar` atom
- `Skeleton` — used by loading.tsx
- `Badge` — used for over-budget indicators

## Fixed vs Flex Budget Type

Both modes use the same `BudgetTable` and same underlying data. Differences:

**Category mode (default):** All groups shown in a flat grouped list. Fixed categories at top (collapsed), variable below. Summary: Total Budgeted | Total Spent | Remaining.

**Flex mode:** Same layout, but summary shifts focus. Summary: Fixed Expenses (total) | Variable Budgeted | Left to Spend (income - fixed - variable). Emphasis on "how much flex money remains."

Toggle between modes via a segmented control in `BudgetPageHeader`. Updates `budgets.type` via `updateBudgetType` action.

The `is_fixed` flag on `budgetCategories` is togglable per-row via a toggle icon. Determines which section a category appears in.

## Everything Else (Unbudgeted Spending)

Read-only section at the bottom of the budget table. Shows:
- Total unbudgeted spending for the month
- List of categories with spending but no budget limit set
- Each row: category name (with group), spent amount
- No progress bars (no limit to compare against)

Computed by: all categories with expense transactions (`normalized_amount > 0`) in the month that are NOT in `budgetCategories` for the current budget. Transactions with `category_id IS NULL` (uncategorized) are included under an "Uncategorized" label.

## Known Limitations

- **Month boundary lag:** `authorized_date` is not stored. Transactions authorized near month-end may post in the next month. A future migration could add `authorized_date` storage if users report boundary issues.
- **Pending exclusion:** Budget spending excludes pending transactions. Mid-month totals may undercount by the sum of pending charges. Users should check the transactions page for pending detail.
- **Rollover deferred:** The `rollover` flag exists in schema but computation is not implemented in this phase.

## Testing

### Test Helpers (additions to `tests/integration/helpers.ts`)

- `insertBudget(db, householdId, overrides?)` → `{ budgetId }` — synchronous, uses `uuid()`, matches existing factory pattern
- `insertBudgetCategory(db, budgetId, categoryId, overrides?)` → `{ budgetCategoryId }` — synchronous
- `insertTransactionSplit(db, transactionId, categoryId, amount, overrides?)` → `{ splitId }` — needed for split transaction spending tests

### Integration Tests

**`tests/integration/budget-queries.test.ts`** (6 tests):
1. Returns null budget + empty groups for month with no budget
2. Returns budgeted categories with correct spent aggregation (uses `normalized_amount > 0`)
3. Handles transaction splits in spending — sums splits, excludes parent to avoid double-counting
4. Excludes transfers, pending, and soft-deleted from spending
5. Excludes income transactions (negative `normalized_amount`) from spending
6. Unbudgeted spending appears in "Everything Else" with correct totals, including uncategorized

**`tests/integration/budget-actions.test.ts`** (6 tests):
1. `createBudget` creates a budget, idempotent on repeat call
2. `setBudgetCategory` upserts limit amount correctly
3. `removeBudgetCategory` deletes the row
4. `copyBudgetFromMonth` copies all category limits to new month; merges if target exists
5. Household isolation — cannot access another household's budget (BOLA prevention)
6. Ownership check on `budgetCategories` — cannot modify budget category via budget belonging to another household

### Unit / Property Tests

**`src/lib/budget-utils.test.ts`** (3-4 tests):
- `budgetProgressPercent` — standard case, zero limit with spending, zero limit with zero spending
- Property test: `test.prop([fc.nat(1_000_000), fc.nat(1_000_000)])` — percentage is always >= 0, and >= 100 when spent >= limit

**`src/lib/money.test.ts`** (addition — 2 tests):
- `parseToCents("125.00")` → 12500, `parseToCents("$1,250")` → 125000, `parseToCents("abc")` → null

### Not Tested

- Component files (declarative UI)
- Schema definitions
- Loading/error boundaries

### Action Test Mock Pattern

Budget action tests must follow the established pattern from `transaction-actions.test.ts`:
```ts
let mockHouseholdId: string;
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../src/lib/auth/session", () => ({
  getHouseholdId: vi.fn(() => Promise.resolve(mockHouseholdId))
}));
```
`mockHouseholdId` is set in `beforeAll` after `insertHousehold`. This avoids stale closure issues.
