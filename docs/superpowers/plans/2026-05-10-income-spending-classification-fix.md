# Income/Spending Classification Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix income categories (Salary, etc.) leaking into spending reports and being misclassified in Income vs Expense charts.

**Architecture:** Add a reusable `notIncome(db)` query predicate to `query-helpers.ts` following the existing `notDeleted()` pattern. Wire it into `spendingBaseConditions()` (fixes spending + trends reports) and `getMonthlySpending()` (fixes dashboard). Separately fix `getIncomeVsExpense()` to classify by category `isIncome` flag instead of `normalizedAmount` sign. Fix test fixtures to use realistic positive `normalizedAmount` for salary on checking accounts.

**Tech Stack:** Drizzle ORM, SQLite, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/query-helpers.ts` | Modify | Add `notIncome(db)` predicate |
| `src/queries/reports.ts` | Modify | Wire `notIncome` into `spendingBaseConditions`; rewrite `getIncomeVsExpense` classification |
| `src/queries/dashboard.ts` | Modify | Wire `notIncome` into `getMonthlySpending` |
| `tests/integration/report-queries.test.ts` | Modify | Fix salary fixture; add income-exclusion regression tests |

---

### Task 1: Add `notIncome(db)` predicate to query-helpers.ts

**Files:**
- Modify: `src/lib/query-helpers.ts`

- [ ] **Step 1: Add the `notIncome` function**

Add imports and the new predicate below `notDeleted`:

```typescript
import { eq, isNull, or, sql, notInArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import type { LedgrDb } from "@/db";
import { transactions, categories } from "@/db/schema";

export function notDeleted(table: { deletedAt: SQLiteColumn }) {
  return isNull(table.deletedAt);
}

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

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/query-helpers.ts
git commit -m "feat: add notIncome(db) query predicate to query-helpers"
```

---

### Task 2: Fix test fixtures and add income-exclusion regression tests

**Files:**
- Modify: `tests/integration/report-queries.test.ts`

- [ ] **Step 1: Fix salary fixture to use realistic positive normalizedAmount**

In the `beforeEach` block, change line 41 from:

```typescript
  insertTransaction(db, householdId, accountId, { date: "2026-03-01", normalizedAmount: -500000, amount: 500000, categoryId: incomeCatId, name: "Salary" });
```

to:

```typescript
  insertTransaction(db, householdId, accountId, { date: "2026-03-01", normalizedAmount: 500000, amount: -500000, categoryId: incomeCatId, name: "Salary" });
```

This matches real Plaid sync behavior: salary deposit on checking account has positive `normalizedAmount` (sign-flipped from Plaid's negative credit) and negative `amount` (raw Plaid).

- [ ] **Step 2: Update the `getIncomeVsExpense` test**

The test name and assertions must change to reflect category-based classification. Replace the entire `getIncomeVsExpense` describe block:

```typescript
describe("getIncomeVsExpense", () => {
  test("classifies by category isIncome flag, not by sign", async () => {
    insertTransaction(db, householdId, accountId, { date: "2026-03-20", normalizedAmount: 2000, amount: -2000, categoryId: null, name: "Unknown" });

    const { getIncomeVsExpense } = await import("../../src/queries/reports");
    const result = getIncomeVsExpense(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    const march = result.find((r) => r.period === "2026-03");
    expect(march).toBeDefined();
    // Salary (500000) is income because category.isIncome = true
    expect(march!.income).toBe(500000);
    // Food (5000 + 3000) + Rent (100000) + Unknown (2000) = 110000
    expect(march!.expenses).toBe(110000);
    expect(march!.net).toBe(500000 - 110000);
  });
});
```

- [ ] **Step 3: Add a regression test for income excluded from spending**

Add inside the `guards` describe block:

```typescript
  test("income categories excluded from spending", async () => {
    const { getSpendingByCategory } = await import("../../src/queries/reports");
    const result = getSpendingByCategory(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    const salary = result.find((r) => r.categoryName === "Salary");
    expect(salary).toBeUndefined();

    const food = result.find((r) => r.categoryName === "Food");
    expect(food?.total).toBe(8000);
  });
```

- [ ] **Step 4: Add a regression test for income excluded from category trends**

Add inside the `getCategoryTrends` describe block:

```typescript
  test("income categories excluded from trends", async () => {
    const { getCategoryTrends } = await import("../../src/queries/reports");
    const result = getCategoryTrends(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    const salaryTrend = result.find((r) => r.categoryName === "Salary");
    expect(salaryTrend).toBeUndefined();
  });
```

- [ ] **Step 5: Run the tests — they should FAIL**

Run: `pnpm test -- tests/integration/report-queries.test.ts`

Expected failures:
- "returns correct totals grouped by category" — salary now has positive normalizedAmount, passes `> 0` filter, appears in spending
- "classifies by category isIncome flag" — `getIncomeVsExpense` still uses sign-based classification
- "income categories excluded from spending" — no `isIncome` filter yet
- "income categories excluded from trends" — no `isIncome` filter yet

The existing "comparison period" and "guards" tests should still pass.

- [ ] **Step 6: Commit the failing tests**

```bash
git add tests/integration/report-queries.test.ts
git commit -m "test: fix salary fixture to realistic positive normalizedAmount, add income exclusion tests (red)"
```

---

### Task 3: Wire `notIncome` into `spendingBaseConditions` and fix `getIncomeVsExpense`

**Files:**
- Modify: `src/queries/reports.ts`

- [ ] **Step 1: Update `spendingBaseConditions` to accept `db` and add `notIncome`**

Change the function signature and add the import + predicate:

Add `notIncome` to the import from `@/lib/query-helpers`:

```typescript
import { notDeleted, notIncome } from "@/lib/query-helpers";
```

Update `spendingBaseConditions`:

```typescript
function spendingBaseConditions(filters: ReportFilters, db: LedgrDb) {
  const conditions = [
    notDeleted(transactions),
    gt(transactions.normalizedAmount, 0),
    eq(transactions.pending, false),
    eq(transactions.isTransfer, false),
    isNull(transactions.transferPairId),
    gte(transactions.date, filters.dateFrom),
    lte(transactions.date, filters.dateTo),
    notIncome(db),
  ];
  if (filters.accountIds?.length) {
    conditions.push(inArray(transactions.accountId, filters.accountIds));
  }
  return conditions;
}
```

- [ ] **Step 2: Update all callers of `spendingBaseConditions` to pass `db`**

In `aggregateSpending` (line 71), change:
```typescript
  const conditions = spendingBaseConditions(filters);
```
to:
```typescript
  const conditions = spendingBaseConditions(filters, db);
```

In `getCategoryTrends` (line 250), change:
```typescript
  const conditions = spendingBaseConditions(filters);
```
to:
```typescript
  const conditions = spendingBaseConditions(filters, db);
```

- [ ] **Step 3: Rewrite `getIncomeVsExpense` to classify by `isIncome` flag**

Replace the entire function body:

```typescript
export function getIncomeVsExpense(
  householdId: string,
  filters: ReportFilters,
  db: LedgrDb = defaultDb,
): IncomeExpenseRow[] {
  const scoped = scopedQuery(householdId, db);

  const conditions = [
    notDeleted(transactions),
    eq(transactions.pending, false),
    eq(transactions.isTransfer, false),
    isNull(transactions.transferPairId),
    gte(transactions.date, filters.dateFrom),
    lte(transactions.date, filters.dateTo),
  ];

  if (filters.accountIds?.length) {
    conditions.push(inArray(transactions.accountId, filters.accountIds));
  }

  const txns = db
    .select({
      date: transactions.date,
      normalizedAmount: transactions.normalizedAmount,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(scoped.where(transactions, ...conditions))
    .all();

  const incomeCatIds = new Set(
    db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.isIncome, true))
      .all()
      .map((r) => r.id),
  );

  const byMonth = new Map<string, { income: number; expenses: number }>();
  for (const txn of txns) {
    const month = txn.date.slice(0, 7);
    if (!byMonth.has(month)) {
      byMonth.set(month, { income: 0, expenses: 0 });
    }
    const entry = byMonth.get(month)!;
    if (txn.categoryId && incomeCatIds.has(txn.categoryId)) {
      entry.income += Math.abs(txn.normalizedAmount);
    } else if (txn.normalizedAmount > 0) {
      entry.expenses += txn.normalizedAmount;
    }
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, { income, expenses }]) => ({
      period,
      income,
      expenses,
      net: income - expenses,
    }));
}
```

Key changes:
- Fetches `categoryId` alongside each transaction
- Builds a `Set` of income category IDs
- Income: `categoryId` is in `incomeCatIds` → use `Math.abs(normalizedAmount)` (handles both positive and negative normalized amounts)
- Expense: not income AND `normalizedAmount > 0`
- Transactions with negative `normalizedAmount` and no income category are ignored (credits/refunds reducing expense totals — they don't belong in either bucket)

- [ ] **Step 4: Run the report tests**

Run: `pnpm test -- tests/integration/report-queries.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/queries/reports.ts
git commit -m "fix: exclude income categories from spending reports, classify by isIncome flag"
```

---

### Task 4: Wire `notIncome` into dashboard `getMonthlySpending`

**Files:**
- Modify: `src/queries/dashboard.ts`

- [ ] **Step 1: Add `notIncome` import and wire into query**

Update the import line:

```typescript
import { notDeleted, notIncome } from "@/lib/query-helpers";
```

In `getMonthlySpending`, add `notIncome(db)` to the WHERE clause. Change:

```typescript
    .where(
      scoped.where(
        transactions,
        notDeleted(transactions),
        gte(transactions.date, dateFrom),
        lte(transactions.date, dateTo),
        eq(transactions.pending, false),
        gt(transactions.normalizedAmount, 0)
      )
    )
```

to:

```typescript
    .where(
      scoped.where(
        transactions,
        notDeleted(transactions),
        gte(transactions.date, dateFrom),
        lte(transactions.date, dateTo),
        eq(transactions.pending, false),
        gt(transactions.normalizedAmount, 0),
        notIncome(db)
      )
    )
```

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/queries/dashboard.ts
git commit -m "fix: exclude income categories from dashboard monthly spending"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run full test suite + typecheck + lint**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: All pass, no warnings

- [ ] **Step 2: Manual smoke test**

Run: `pnpm dev`

Open the Reports page in browser. Verify:
- "Spending by Category" does NOT show Salary or other income categories
- "Income vs Expense" correctly shows Salary as income, not expense
- "Trends" does NOT show income categories
- Dashboard spending widget does NOT show income categories

- [ ] **Step 3: Final commit if any cleanup needed, otherwise done**
