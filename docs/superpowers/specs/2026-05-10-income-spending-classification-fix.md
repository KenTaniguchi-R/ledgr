# Income/Spending Classification Fix

**Date:** 2026-05-10
**Status:** Approved
**Scope:** Bug fix + minor query-layer refactor

## Problem

Salary and other income-category transactions appear in spending reports and are misclassified in the Income vs Expense chart.

### Root Cause

`normalizeAmount()` flips signs for checking/savings accounts: a Plaid salary deposit (`amount = -5000`) becomes `normalizedAmount = +5000`. This is correct for display (positive = activity magnitude), but spending queries filter only on `normalizedAmount > 0` without consulting the category's `isIncome` flag. Income transactions with positive normalized amounts pass the spending filter.

### Affected Functions

| # | Function | File | Bug |
|---|----------|------|-----|
| 1 | `spendingBaseConditions()` | `src/queries/reports.ts` | No `isIncome` check — income leaks into spending + trends |
| 2 | `getIncomeVsExpense()` | `src/queries/reports.ts` | Classifies by sign only — salary counted as expense |
| 3 | `getMonthlySpending()` | `src/queries/dashboard.ts` | Same `normalizedAmount > 0` filter, independent impl |

### Test Gap

Tests insert salary with `normalizedAmount: -500000`, which doesn't match real Plaid sync output (positive for checking accounts). Tests pass but don't exercise the real-world scenario.

## Design

### Approach: Hybrid A+B

Combine a reusable query predicate (following `notDeleted()` pattern) with targeted fixes at each affected callsite.

### 1. New `notIncome(db)` predicate in `query-helpers.ts`

```typescript
export function notIncome(db: LedgrDb): SQL {
  const ids = db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.isIncome, true))
    .all()
    .map((r) => r.id);
  if (ids.length === 0) return sql`1=1`;
  return or(
    isNull(transactions.categoryId),
    notInArray(transactions.categoryId, ids),
  )!;
}
```

- Follows the existing `notDeleted()` convention: composable predicate, drop into any `where()`
- Handles uncategorized transactions (null categoryId) — they count as spending until categorized
- Dynamic: if user adds/removes income categories, it just works

### 2. Fix `spendingBaseConditions()` in `reports.ts`

Add `db: LedgrDb` parameter. Add `notIncome(db)` to the conditions array. This fixes both `getSpendingByCategory` and `getCategoryTrends` in one shot since both consume this shared helper.

### 3. Fix `getIncomeVsExpense()` in `reports.ts`

Join the `categories` table and use `isIncome` flag for classification instead of `normalizedAmount` sign:
- `isIncome = true` -> income bucket
- `isIncome = false` or uncategorized -> expense bucket (still filtered by `normalizedAmount > 0` for expenses, `normalizedAmount < 0` is ignored since those are credits that reduce expense totals)

Actually, the simpler correct approach: fetch `categoryId` alongside each transaction, look up whether it's income, and bucket accordingly. This avoids changing the query shape and keeps the aggregation in JS where it already lives.

### 4. Fix `getMonthlySpending()` in `dashboard.ts`

Add `notIncome(db)` to the WHERE conditions. One-line addition.

### 5. Fix tests in `report-queries.test.ts`

- Change salary fixture from `normalizedAmount: -500000` to `normalizedAmount: 500000` (positive, matching real Plaid sync for checking accounts)
- Existing assertion `expect(salary).toBeUndefined()` now actually exercises the `isIncome` filter
- Fix `getIncomeVsExpense` test to match updated classification logic
- Add a test for uncategorized transactions with positive normalizedAmount (should still count as spending)

## Files to Modify

1. `src/lib/query-helpers.ts` — add `notIncome(db)` predicate
2. `src/queries/reports.ts` — fix `spendingBaseConditions`, `getIncomeVsExpense`
3. `src/queries/dashboard.ts` — fix `getMonthlySpending`
4. `tests/integration/report-queries.test.ts` — fix salary fixture, update assertions

## Edge Cases

- **Uncategorized transactions:** `isNull(categoryId)` in the `or()` ensures they aren't excluded from spending
- **Refunds on income:** A reversed salary (positive Plaid amount) normalizes to negative — won't appear in spending (filtered by `normalizedAmount > 0`) and won't appear as income (it's a reduction). This is correct behavior.
- **Investment dividends:** PFC map should route `INCOME_DIVIDENDS` to an `isIncome: true` category. If the PFC map is correct, this fix handles it automatically.
- **Category reclassification:** If a user changes a category's `isIncome` flag, the next report query picks it up immediately since `notIncome(db)` is dynamic.

## Non-Goals

- No schema migrations (no new columns)
- No changes to `normalizeAmount()` convention
- No denormalization of `isIncome` onto transactions table
- No changes to Plaid sync pipeline
