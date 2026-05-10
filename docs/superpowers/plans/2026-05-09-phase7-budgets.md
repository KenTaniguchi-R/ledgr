# Phase 7 — Budgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a YNAB-style inline-edit budget table with fixed/flex modes, spending aggregation from transactions, copy-from-month, and unbudgeted spending visibility.

**Architecture:** Server component page fetches budget + spending data via queries layer, passes to client organisms. Inline editing fires server actions with optimistic updates. Spending is computed live by aggregating `normalized_amount > 0` from transactions, grouped by category. Ownership enforced by JOINing through `budgets` table (since `budgetCategories` has no `householdId`).

**Tech Stack:** Next.js 16 App Router, Drizzle ORM, SQLite, shadcn/ui (Progress, Skeleton, Badge), Tailwind v4, Vitest, fast-check

---

### Task 1: Schema Migration — Add Index on transactionSplits.categoryId

**Files:**
- Modify: `src/db/schema/transactions.ts:50-65`

- [ ] **Step 1: Add the index to the transactionSplits table definition**

In `src/db/schema/transactions.ts`, add a second index to the `transactionSplits` table's index array:

```ts
(table) => [
  index("idx_splits_txn").on(table.transactionId),
  index("idx_splits_category").on(table.categoryId),
]
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: A new migration file in `src/db/migrations/` with `CREATE INDEX idx_splits_category ON transaction_splits(category_id)`

- [ ] **Step 3: Run the migration**

Run: `pnpm db:migrate`
Expected: Migration applies successfully

- [ ] **Step 4: Verify existing tests still pass**

Run: `pnpm test --run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/transactions.ts src/db/migrations/
git commit -m "feat(budgets): add index on transactionSplits.categoryId for spending aggregation"
```

---

### Task 2: Add parseToCents to money.ts + Tests

**Files:**
- Modify: `src/lib/money.ts`
- Modify: `src/lib/money.test.ts`

- [ ] **Step 1: Write the failing tests for parseToCents**

Add to `src/lib/money.test.ts`:

```ts
import {
  centsToDisplay,
  displayToCents,
  plaidAmountToCents,
  normalizeAmount,
  parseToCents,
} from "./money";

// ... existing tests ...

describe("parseToCents", () => {
  it("parses a simple dollar string", () => {
    expect(parseToCents("125.00")).toBe(12500);
  });
  it("parses a string without decimals", () => {
    expect(parseToCents("125")).toBe(12500);
  });
  it("parses a string with $ prefix", () => {
    expect(parseToCents("$125.00")).toBe(12500);
  });
  it("parses a string with commas", () => {
    expect(parseToCents("$1,250.00")).toBe(125000);
  });
  it("returns null for invalid input", () => {
    expect(parseToCents("abc")).toBeNull();
  });
  it("returns null for empty string", () => {
    expect(parseToCents("")).toBeNull();
  });
  it("returns 0 for '0'", () => {
    expect(parseToCents("0")).toBe(0);
  });
  it("handles whitespace", () => {
    expect(parseToCents("  125.50  ")).toBe(12550);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/money.test.ts`
Expected: FAIL — `parseToCents is not a function`

- [ ] **Step 3: Implement parseToCents**

Add to `src/lib/money.ts`:

```ts
export function parseToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const parsed = Number(cleaned);
  if (Number.isNaN(parsed)) return null;
  return Math.round(parsed * 100);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/money.test.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/money.ts src/lib/money.test.ts
git commit -m "feat(budgets): add parseToCents utility for user-entered dollar amounts"
```

---

### Task 3: Add budgetProgressPercent utility + Tests

**Files:**
- Create: `src/lib/budget-utils.ts`
- Create: `src/lib/budget-utils.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/budget-utils.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { test, fc } from "@fast-check/vitest";
import { budgetProgressPercent } from "./budget-utils";

describe("budgetProgressPercent", () => {
  it("returns percentage for normal case", () => {
    expect(budgetProgressPercent(5000, 10000)).toBe(50);
  });

  it("returns 0 when both spent and limit are 0", () => {
    expect(budgetProgressPercent(0, 0)).toBe(0);
  });

  it("returns 100 when spent > 0 and limit is 0", () => {
    expect(budgetProgressPercent(5000, 0)).toBe(100);
  });

  it("returns value > 100 when overspent", () => {
    expect(budgetProgressPercent(15000, 10000)).toBe(150);
  });

  it("returns 0 when spent is 0", () => {
    expect(budgetProgressPercent(0, 10000)).toBe(0);
  });

  test.prop([fc.nat(1_000_000), fc.nat(1_000_000)])(
    "percentage is always >= 0",
    (spent, limit) => {
      expect(budgetProgressPercent(spent, limit)).toBeGreaterThanOrEqual(0);
    },
  );

  test.prop([fc.integer({ min: 1, max: 1_000_000 }), fc.integer({ min: 1, max: 1_000_000 })])(
    "percentage >= 100 when spent >= limit",
    (base, extra) => {
      const limit = base;
      const spent = base + extra;
      expect(budgetProgressPercent(spent, limit)).toBeGreaterThanOrEqual(100);
    },
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/budget-utils.test.ts`
Expected: FAIL — `Cannot find module './budget-utils'`

- [ ] **Step 3: Implement budgetProgressPercent**

Create `src/lib/budget-utils.ts`:

```ts
export function budgetProgressPercent(spent: number, limit: number): number {
  if (limit === 0) return spent > 0 ? 100 : 0;
  return Math.round((spent / limit) * 100);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/budget-utils.test.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/budget-utils.ts src/lib/budget-utils.test.ts
git commit -m "feat(budgets): add budgetProgressPercent utility with property tests"
```

---

### Task 4: Add Test Factory Helpers

**Files:**
- Modify: `tests/integration/helpers.ts`

- [ ] **Step 1: Add insertBudget, insertBudgetCategory, insertTransactionSplit**

Add to `tests/integration/helpers.ts`. First add the imports at the top:

```ts
import {
  households,
  accounts,
  transactions,
  transactionSplits,
  merchants,
  categoryGroups,
  categories,
  categoryRules,
  budgets,
  budgetCategories,
} from "../../src/db/schema";
```

Then add the three factory functions at the end of the file:

```ts
export function insertBudget(
  db: LedgrDb,
  householdId: string,
  overrides: Partial<typeof budgets.$inferInsert> = {},
) {
  const id = uuid();
  const now = new Date().toISOString();
  db.insert(budgets)
    .values({
      id,
      householdId,
      month: "2026-05",
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .run();
  return { budgetId: id };
}

export function insertBudgetCategory(
  db: LedgrDb,
  budgetId: string,
  categoryId: string,
  overrides: Partial<typeof budgetCategories.$inferInsert> = {},
) {
  const id = uuid();
  db.insert(budgetCategories)
    .values({
      id,
      budgetId,
      categoryId,
      limitAmount: 10000,
      ...overrides,
    })
    .run();
  return { budgetCategoryId: id };
}

export function insertTransactionSplit(
  db: LedgrDb,
  transactionId: string,
  categoryId: string,
  amount: number,
  overrides: Partial<typeof transactionSplits.$inferInsert> = {},
) {
  const id = uuid();
  db.insert(transactionSplits)
    .values({
      id,
      transactionId,
      categoryId,
      amount,
      ...overrides,
    })
    .run();
  return { splitId: id };
}
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `pnpm test --run`
Expected: All tests pass (new helpers are additive)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/helpers.ts
git commit -m "feat(budgets): add insertBudget, insertBudgetCategory, insertTransactionSplit test factories"
```

---

### Task 5: Budget Spending Query

**Files:**
- Create: `src/queries/budgets.ts`
- Create: `tests/integration/budget-queries.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/integration/budget-queries.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertTransaction,
  insertTransactionSplit,
  insertCategoryGroup,
  insertCategory,
  insertBudget,
  insertBudgetCategory,
} from "./helpers";
import { getBudgetForMonth } from "../../src/queries/budgets";
import type { LedgrDb } from "../../src/db";

describe("budget queries", () => {
  let db: LedgrDb;
  let close: () => void;
  let householdId: string;
  let accountId: string;
  let groupId: string;
  let groceriesId: string;
  let diningId: string;
  let incomeGroupId: string;
  let salaryId: string;

  beforeAll(() => {
    const testDb = createTestDb();
    db = testDb.db;
    close = testDb.close;

    ({ householdId } = insertHousehold(db));
    ({ accountId } = insertAccount(db, householdId));
    ({ groupId } = insertCategoryGroup(db, householdId, { name: "Food & Drink" }));
    ({ categoryId: groceriesId } = insertCategory(db, householdId, groupId, { name: "Groceries" }));
    ({ categoryId: diningId } = insertCategory(db, householdId, groupId, { name: "Dining" }));
    ({ groupId: incomeGroupId } = insertCategoryGroup(db, householdId, { name: "Income" }));
    ({ categoryId: salaryId } = insertCategory(db, householdId, incomeGroupId, { name: "Salary", isIncome: true }));
  });

  afterAll(() => close());

  it("returns null budget for month with no budget", () => {
    const result = getBudgetForMonth(householdId, "2026-01", db);
    expect(result.budget).toBeNull();
    expect(result.groups).toEqual([]);
    expect(result.summary.totalBudgeted).toBe(0);
  });

  it("returns budgeted categories with correct spent aggregation", () => {
    const { budgetId } = insertBudget(db, householdId, { month: "2026-03" });
    insertBudgetCategory(db, budgetId, groceriesId, { limitAmount: 50000 });

    // Two expense transactions in March
    insertTransaction(db, householdId, accountId, {
      date: "2026-03-05",
      categoryId: groceriesId,
      normalizedAmount: 2500,
      amount: -2500,
    });
    insertTransaction(db, householdId, accountId, {
      date: "2026-03-15",
      categoryId: groceriesId,
      normalizedAmount: 3500,
      amount: -3500,
    });

    const result = getBudgetForMonth(householdId, "2026-03", db);
    expect(result.budget).not.toBeNull();
    const foodGroup = result.groups.find((g) => g.groupName === "Food & Drink");
    expect(foodGroup).toBeDefined();
    const groceries = foodGroup!.categories.find((c) => c.categoryName === "Groceries");
    expect(groceries).toBeDefined();
    expect(groceries!.spent).toBe(6000);
    expect(groceries!.limitAmount).toBe(50000);
    expect(groceries!.remaining).toBe(44000);
  });

  it("handles transaction splits — sums splits, excludes parent", () => {
    const { budgetId } = insertBudget(db, householdId, { month: "2026-04" });
    insertBudgetCategory(db, budgetId, groceriesId, { limitAmount: 30000 });
    insertBudgetCategory(db, budgetId, diningId, { limitAmount: 20000 });

    // Parent transaction with splits
    const { transactionId } = insertTransaction(db, householdId, accountId, {
      date: "2026-04-10",
      categoryId: groceriesId,
      normalizedAmount: 10000,
      amount: -10000,
    });
    insertTransactionSplit(db, transactionId, groceriesId, 6000);
    insertTransactionSplit(db, transactionId, diningId, 4000);

    const result = getBudgetForMonth(householdId, "2026-04", db);
    const foodGroup = result.groups.find((g) => g.groupName === "Food & Drink");
    const groceries = foodGroup!.categories.find((c) => c.categoryName === "Groceries");
    const dining = foodGroup!.categories.find((c) => c.categoryName === "Dining");
    expect(groceries!.spent).toBe(6000);
    expect(dining!.spent).toBe(4000);
  });

  it("excludes transfers, pending, and soft-deleted from spending", () => {
    const { budgetId } = insertBudget(db, householdId, { month: "2026-02" });
    insertBudgetCategory(db, budgetId, groceriesId, { limitAmount: 50000 });

    // Normal expense — should count
    insertTransaction(db, householdId, accountId, {
      date: "2026-02-01",
      categoryId: groceriesId,
      normalizedAmount: 1000,
      amount: -1000,
    });
    // Transfer — should NOT count
    insertTransaction(db, householdId, accountId, {
      date: "2026-02-02",
      categoryId: groceriesId,
      normalizedAmount: 2000,
      amount: -2000,
      isTransfer: true,
    });
    // Pending — should NOT count
    insertTransaction(db, householdId, accountId, {
      date: "2026-02-03",
      categoryId: groceriesId,
      normalizedAmount: 3000,
      amount: -3000,
      pending: true,
    });
    // Soft-deleted — should NOT count
    insertTransaction(db, householdId, accountId, {
      date: "2026-02-04",
      categoryId: groceriesId,
      normalizedAmount: 4000,
      amount: -4000,
      deletedAt: new Date().toISOString(),
    });

    const result = getBudgetForMonth(householdId, "2026-02", db);
    const foodGroup = result.groups.find((g) => g.groupName === "Food & Drink");
    const groceries = foodGroup!.categories.find((c) => c.categoryName === "Groceries");
    expect(groceries!.spent).toBe(1000);
  });

  it("excludes income transactions from spending", () => {
    const { budgetId } = insertBudget(db, householdId, { month: "2026-06" });
    insertBudgetCategory(db, budgetId, salaryId, { limitAmount: 0 });

    // Income transaction (negative normalizedAmount)
    insertTransaction(db, householdId, accountId, {
      date: "2026-06-01",
      categoryId: salaryId,
      normalizedAmount: -500000,
      amount: 500000,
    });

    const result = getBudgetForMonth(householdId, "2026-06", db);
    const incomeGroup = result.groups.find((g) => g.groupName === "Income");
    const salary = incomeGroup?.categories.find((c) => c.categoryName === "Salary");
    expect(salary?.spent ?? 0).toBe(0);
  });

  it("shows unbudgeted spending in 'Everything Else'", () => {
    insertBudget(db, householdId, { month: "2026-07" });
    // No budgetCategory for dining — it's unbudgeted

    insertTransaction(db, householdId, accountId, {
      date: "2026-07-10",
      categoryId: diningId,
      normalizedAmount: 5000,
      amount: -5000,
    });
    // Uncategorized transaction
    insertTransaction(db, householdId, accountId, {
      date: "2026-07-15",
      normalizedAmount: 2000,
      amount: -2000,
    });

    const result = getBudgetForMonth(householdId, "2026-07", db);
    expect(result.unbudgeted.spent).toBe(7000);
    expect(result.unbudgeted.categories).toHaveLength(2);
    const diningUnbudgeted = result.unbudgeted.categories.find((c) => c.categoryName === "Dining");
    expect(diningUnbudgeted!.spent).toBe(5000);
    const uncategorized = result.unbudgeted.categories.find((c) => c.categoryName === "Uncategorized");
    expect(uncategorized!.spent).toBe(2000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/integration/budget-queries.test.ts`
Expected: FAIL — `Cannot find module '../../src/queries/budgets'`

- [ ] **Step 3: Implement getBudgetSpending helper**

Create `src/queries/budgets.ts`:

```ts
import { eq, and, gt, gte, lt, isNull, sql, inArray, notInArray, type SQL } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  budgets,
  budgetCategories,
  transactions,
  transactionSplits,
  categories,
  categoryGroups,
  plaidItems,
} from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";

export interface BudgetCategoryRow {
  budgetCategoryId: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string | null;
  limitAmount: number;
  spent: number;
  remaining: number;
  isFixed: boolean;
}

export interface BudgetGroup {
  groupId: string;
  groupName: string;
  groupIcon: string | null;
  categories: BudgetCategoryRow[];
  totalBudgeted: number;
  totalSpent: number;
}

export interface UnbudgetedCategory {
  categoryId: string;
  categoryName: string;
  groupName: string;
  spent: number;
}

export interface BudgetMonth {
  budget: { id: string; month: string; type: "category" | "flex" } | null;
  groups: BudgetGroup[];
  unbudgeted: { spent: number; categories: UnbudgetedCategory[] };
  summary: { totalBudgeted: number; totalSpent: number; totalRemaining: number };
  lastSyncedAt: string | null;
}

function nextMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const next = m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, "0")}`;
  return next;
}

function spendingConditions(
  scoped: ReturnType<typeof scopedQuery>,
  month: string,
): SQL {
  return scoped.where(
    transactions,
    gte(transactions.date, `${month}-01`),
    lt(transactions.date, `${nextMonth(month)}-01`),
    gt(transactions.normalizedAmount, 0),
    eq(transactions.isTransfer, false),
    eq(transactions.pending, false),
    notDeleted(transactions),
  )!;
}

function getBudgetSpending(
  householdId: string,
  month: string,
  db: LedgrDb,
): Map<string | null, number> {
  const scoped = scopedQuery(householdId, db);
  const where = spendingConditions(scoped, month);

  // Get IDs of transactions that have splits
  const splitTxnIds = db
    .select({ transactionId: transactionSplits.transactionId })
    .from(transactionSplits)
    .all()
    .map((r) => r.transactionId);

  // Non-split transactions: group by categoryId
  const nonSplitConditions = splitTxnIds.length > 0
    ? and(where, notInArray(transactions.id, splitTxnIds))
    : where;

  const nonSplitRows = db
    .select({
      categoryId: transactions.categoryId,
      spent: sql<number>`sum(${transactions.normalizedAmount})`,
    })
    .from(transactions)
    .where(nonSplitConditions)
    .groupBy(transactions.categoryId)
    .all();

  // Split transactions: group by split categoryId
  const splitRows = splitTxnIds.length > 0
    ? db
        .select({
          categoryId: transactionSplits.categoryId,
          spent: sql<number>`sum(${transactionSplits.amount})`,
        })
        .from(transactionSplits)
        .innerJoin(transactions, eq(transactionSplits.transactionId, transactions.id))
        .where(where)
        .groupBy(transactionSplits.categoryId)
        .all()
    : [];

  const spendingMap = new Map<string | null, number>();
  for (const row of nonSplitRows) {
    const key = row.categoryId;
    spendingMap.set(key, (spendingMap.get(key) ?? 0) + row.spent);
  }
  for (const row of splitRows) {
    const key = row.categoryId;
    spendingMap.set(key, (spendingMap.get(key) ?? 0) + row.spent);
  }

  return spendingMap;
}

export function getBudgetForMonth(
  householdId: string,
  month: string,
  db: LedgrDb = defaultDb,
): BudgetMonth {
  const scoped = scopedQuery(householdId, db);

  // Fetch budget for this month
  const budget = db
    .select({
      id: budgets.id,
      month: budgets.month,
      type: budgets.type,
    })
    .from(budgets)
    .where(scoped.where(budgets, eq(budgets.month, month)))
    .get();

  // Fetch spending
  const spendingMap = getBudgetSpending(householdId, month, db);

  if (!budget) {
    // No budget — all spending is unbudgeted
    const unbudgetedCategories = buildUnbudgetedCategories(spendingMap, new Set(), householdId, db);
    const totalUnbudgetedSpent = unbudgetedCategories.reduce((sum, c) => sum + c.spent, 0);
    return {
      budget: null,
      groups: [],
      unbudgeted: { spent: totalUnbudgetedSpent, categories: unbudgetedCategories },
      summary: { totalBudgeted: 0, totalSpent: totalUnbudgetedSpent, totalRemaining: 0 },
      lastSyncedAt: getLastSyncedAt(householdId, db),
    };
  }

  // Fetch budget categories with their category + group info
  const budgetCatRows = db
    .select({
      budgetCategoryId: budgetCategories.id,
      categoryId: budgetCategories.categoryId,
      limitAmount: budgetCategories.limitAmount,
      isFixed: budgetCategories.isFixed,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      groupId: categoryGroups.id,
      groupName: categoryGroups.name,
      groupIcon: categoryGroups.icon,
      groupSortOrder: categoryGroups.sortOrder,
    })
    .from(budgetCategories)
    .innerJoin(categories, eq(budgetCategories.categoryId, categories.id))
    .innerJoin(categoryGroups, eq(categories.groupId, categoryGroups.id))
    .where(eq(budgetCategories.budgetId, budget.id))
    .all();

  // Build groups
  const groupMap = new Map<string, BudgetGroup>();
  const budgetedCategoryIds = new Set<string>();

  for (const row of budgetCatRows) {
    budgetedCategoryIds.add(row.categoryId);
    const spent = spendingMap.get(row.categoryId) ?? 0;

    if (!groupMap.has(row.groupId)) {
      groupMap.set(row.groupId, {
        groupId: row.groupId,
        groupName: row.groupName,
        groupIcon: row.groupIcon,
        categories: [],
        totalBudgeted: 0,
        totalSpent: 0,
      });
    }

    const group = groupMap.get(row.groupId)!;
    group.categories.push({
      budgetCategoryId: row.budgetCategoryId,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      categoryIcon: row.categoryIcon,
      limitAmount: row.limitAmount,
      spent,
      remaining: row.limitAmount - spent,
      isFixed: Boolean(row.isFixed),
    });
    group.totalBudgeted += row.limitAmount;
    group.totalSpent += spent;
  }

  const groups = Array.from(groupMap.values());

  // Unbudgeted
  const unbudgetedCategories = buildUnbudgetedCategories(spendingMap, budgetedCategoryIds, householdId, db);
  const totalUnbudgetedSpent = unbudgetedCategories.reduce((sum, c) => sum + c.spent, 0);

  const totalBudgeted = groups.reduce((sum, g) => sum + g.totalBudgeted, 0);
  const totalSpent = groups.reduce((sum, g) => sum + g.totalSpent, 0) + totalUnbudgetedSpent;

  return {
    budget: { id: budget.id, month: budget.month, type: (budget.type ?? "category") as "category" | "flex" },
    groups,
    unbudgeted: { spent: totalUnbudgetedSpent, categories: unbudgetedCategories },
    summary: {
      totalBudgeted,
      totalSpent,
      totalRemaining: totalBudgeted - totalSpent,
    },
    lastSyncedAt: getLastSyncedAt(householdId, db),
  };
}

function buildUnbudgetedCategories(
  spendingMap: Map<string | null, number>,
  budgetedCategoryIds: Set<string>,
  householdId: string,
  db: LedgrDb,
): UnbudgetedCategory[] {
  const result: UnbudgetedCategory[] = [];

  for (const [categoryId, spent] of spendingMap) {
    if (categoryId !== null && budgetedCategoryIds.has(categoryId)) continue;

    if (categoryId === null) {
      result.push({
        categoryId: "__uncategorized__",
        categoryName: "Uncategorized",
        groupName: "",
        spent,
      });
    } else {
      const catInfo = db
        .select({
          categoryName: categories.name,
          groupName: categoryGroups.name,
        })
        .from(categories)
        .innerJoin(categoryGroups, eq(categories.groupId, categoryGroups.id))
        .where(eq(categories.id, categoryId))
        .get();

      if (catInfo) {
        result.push({
          categoryId,
          categoryName: catInfo.categoryName,
          groupName: catInfo.groupName,
          spent,
        });
      }
    }
  }

  return result;
}

function getLastSyncedAt(householdId: string, db: LedgrDb): string | null {
  const scoped = scopedQuery(householdId, db);
  const row = db
    .select({ updatedAt: plaidItems.updatedAt })
    .from(plaidItems)
    .where(scoped.where(plaidItems, eq(plaidItems.status, "active")))
    .orderBy(sql`${plaidItems.updatedAt} DESC`)
    .limit(1)
    .get();
  return row?.updatedAt ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/integration/budget-queries.test.ts`
Expected: All 6 tests pass

- [ ] **Step 5: Run full test suite**

Run: `pnpm test --run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/queries/budgets.ts tests/integration/budget-queries.test.ts
git commit -m "feat(budgets): add getBudgetForMonth query with spending aggregation"
```

---

### Task 6: Budget Server Actions

**Files:**
- Create: `src/actions/budgets.ts`
- Create: `tests/integration/budget-actions.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/integration/budget-actions.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertCategoryGroup,
  insertCategory,
  insertBudget,
  insertBudgetCategory,
} from "./helpers";
import {
  createBudget,
  setBudgetCategory,
  removeBudgetCategory,
  copyBudgetFromMonth,
} from "../../src/actions/budgets";
import { budgets, budgetCategories } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import type { LedgrDb } from "../../src/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let mockHouseholdId: string;
vi.mock("../../src/lib/auth/session", () => ({
  getHouseholdId: vi.fn(() => Promise.resolve(mockHouseholdId)),
}));

describe("budget actions", () => {
  let db: LedgrDb;
  let close: () => void;
  let categoryId1: string;
  let categoryId2: string;
  let otherHouseholdId: string;

  beforeAll(() => {
    const testDb = createTestDb();
    db = testDb.db;
    close = testDb.close;

    const hh = insertHousehold(db);
    mockHouseholdId = hh.householdId;
    const { groupId } = insertCategoryGroup(db, hh.householdId);
    ({ categoryId: categoryId1 } = insertCategory(db, hh.householdId, groupId, { name: "Groceries" }));
    ({ categoryId: categoryId2 } = insertCategory(db, hh.householdId, groupId, { name: "Dining" }));

    // Other household for isolation tests
    const other = insertHousehold(db, "Other Household");
    otherHouseholdId = other.householdId;
  });

  afterAll(() => close());

  describe("createBudget", () => {
    it("creates a budget and returns it; idempotent on repeat", async () => {
      const r1 = await createBudget("2026-08", db);
      expect(r1).toMatchObject({ success: true });
      expect("budgetId" in r1 && r1.budgetId).toBeTruthy();

      const r2 = await createBudget("2026-08", db);
      expect(r2).toMatchObject({ success: true });
      if ("budgetId" in r1 && "budgetId" in r2) {
        expect(r2.budgetId).toBe(r1.budgetId);
      }
    });
  });

  describe("setBudgetCategory", () => {
    it("upserts a budget category limit", async () => {
      const { budgetId } = insertBudget(db, mockHouseholdId, { month: "2026-09" });

      const r1 = await setBudgetCategory(budgetId, categoryId1, 50000, db);
      expect(r1).toEqual({ success: true });

      // Verify in DB
      const row = db.select().from(budgetCategories)
        .where(eq(budgetCategories.budgetId, budgetId)).all();
      expect(row).toHaveLength(1);
      expect(row[0].limitAmount).toBe(50000);

      // Update the limit
      const r2 = await setBudgetCategory(budgetId, categoryId1, 75000, db);
      expect(r2).toEqual({ success: true });
      const updated = db.select().from(budgetCategories)
        .where(eq(budgetCategories.budgetId, budgetId)).all();
      expect(updated).toHaveLength(1);
      expect(updated[0].limitAmount).toBe(75000);
    });
  });

  describe("removeBudgetCategory", () => {
    it("deletes the budget category row", async () => {
      const { budgetId } = insertBudget(db, mockHouseholdId, { month: "2026-10" });
      insertBudgetCategory(db, budgetId, categoryId1, { limitAmount: 30000 });

      const result = await removeBudgetCategory(budgetId, categoryId1, db);
      expect(result).toEqual({ success: true });

      const remaining = db.select().from(budgetCategories)
        .where(eq(budgetCategories.budgetId, budgetId)).all();
      expect(remaining).toHaveLength(0);
    });
  });

  describe("copyBudgetFromMonth", () => {
    it("copies category limits to a new month; merges if target exists", async () => {
      const { budgetId: sourceId } = insertBudget(db, mockHouseholdId, { month: "2026-11" });
      insertBudgetCategory(db, sourceId, categoryId1, { limitAmount: 40000 });
      insertBudgetCategory(db, sourceId, categoryId2, { limitAmount: 20000 });

      const result = await copyBudgetFromMonth("2026-11", "2026-12", db);
      expect(result).toMatchObject({ success: true });

      // Verify target budget exists with 2 categories
      const targetBudget = db.select().from(budgets)
        .where(eq(budgets.month, "2026-12")).get();
      expect(targetBudget).toBeDefined();

      const targetCats = db.select().from(budgetCategories)
        .where(eq(budgetCategories.budgetId, targetBudget!.id)).all();
      expect(targetCats).toHaveLength(2);
      expect(targetCats.map((c) => c.limitAmount).sort()).toEqual([20000, 40000]);
    });
  });

  describe("household isolation", () => {
    it("cannot access another household's budget", async () => {
      const { budgetId: otherBudgetId } = insertBudget(db, otherHouseholdId, { month: "2026-09" });

      const result = await setBudgetCategory(otherBudgetId, categoryId1, 50000, db);
      expect(result).toEqual({ error: "Budget not found" });
    });

    it("cannot modify budget category via budget belonging to another household", async () => {
      const { budgetId: otherBudgetId } = insertBudget(db, otherHouseholdId, { month: "2026-10" });
      const { groupId: otherGroupId } = insertCategoryGroup(db, otherHouseholdId);
      const { categoryId: otherCatId } = insertCategory(db, otherHouseholdId, otherGroupId);
      insertBudgetCategory(db, otherBudgetId, otherCatId, { limitAmount: 10000 });

      const result = await removeBudgetCategory(otherBudgetId, otherCatId, db);
      expect(result).toEqual({ error: "Budget not found" });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/integration/budget-actions.test.ts`
Expected: FAIL — `Cannot find module '../../src/actions/budgets'`

- [ ] **Step 3: Implement budget actions**

Create `src/actions/budgets.ts`:

```ts
"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { db as defaultDb, type LedgrDb } from "@/db";
import { budgets, budgetCategories } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { getHouseholdId } from "@/lib/auth/session";

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const budgetIdSchema = z.string().min(1);
const categoryIdSchema = z.string().min(1);
const limitAmountSchema = z.number().int().min(0);

function verifyBudgetOwnership(
  budgetId: string,
  householdId: string,
  db: LedgrDb,
) {
  const scoped = scopedQuery(householdId, db);
  return db
    .select({ id: budgets.id })
    .from(budgets)
    .where(scoped.where(budgets, eq(budgets.id, budgetId)))
    .get();
}

export async function createBudget(
  month: string,
  db: LedgrDb = defaultDb,
): Promise<{ success: true; budgetId: string } | { error: string }> {
  const parsed = monthSchema.safeParse(month);
  if (!parsed.success) return { error: "Invalid month format (YYYY-MM)" };

  const householdId = await getHouseholdId();
  const scoped = scopedQuery(householdId, db);

  const existing = db
    .select({ id: budgets.id })
    .from(budgets)
    .where(scoped.where(budgets, eq(budgets.month, month)))
    .get();

  if (existing) {
    return { success: true, budgetId: existing.id };
  }

  const id = uuid();
  const now = new Date().toISOString();
  db.insert(budgets)
    .values({ id, householdId, month, createdAt: now, updatedAt: now })
    .run();

  revalidatePath("/budgets");
  return { success: true, budgetId: id };
}

export async function setBudgetCategory(
  budgetId: string,
  categoryId: string,
  limitAmount: number,
  db: LedgrDb = defaultDb,
): Promise<{ success: true } | { error: string }> {
  const parsedBudgetId = budgetIdSchema.safeParse(budgetId);
  const parsedCatId = categoryIdSchema.safeParse(categoryId);
  const parsedLimit = limitAmountSchema.safeParse(limitAmount);
  if (!parsedBudgetId.success || !parsedCatId.success || !parsedLimit.success) {
    return { error: "Invalid input" };
  }

  const householdId = await getHouseholdId();
  const owned = verifyBudgetOwnership(budgetId, householdId, db);
  if (!owned) return { error: "Budget not found" };

  const existing = db
    .select({ id: budgetCategories.id })
    .from(budgetCategories)
    .where(
      and(
        eq(budgetCategories.budgetId, budgetId),
        eq(budgetCategories.categoryId, categoryId),
      ),
    )
    .get();

  if (existing) {
    db.update(budgetCategories)
      .set({ limitAmount })
      .where(eq(budgetCategories.id, existing.id))
      .run();
  } else {
    db.insert(budgetCategories)
      .values({ id: uuid(), budgetId, categoryId, limitAmount })
      .run();
  }

  revalidatePath("/budgets");
  return { success: true };
}

export async function removeBudgetCategory(
  budgetId: string,
  categoryId: string,
  db: LedgrDb = defaultDb,
): Promise<{ success: true } | { error: string }> {
  const householdId = await getHouseholdId();
  const owned = verifyBudgetOwnership(budgetId, householdId, db);
  if (!owned) return { error: "Budget not found" };

  db.delete(budgetCategories)
    .where(
      and(
        eq(budgetCategories.budgetId, budgetId),
        eq(budgetCategories.categoryId, categoryId),
      ),
    )
    .run();

  revalidatePath("/budgets");
  return { success: true };
}

export async function copyBudgetFromMonth(
  sourceMonth: string,
  targetMonth: string,
  db: LedgrDb = defaultDb,
): Promise<{ success: true; budgetId: string } | { error: string }> {
  const parsedSource = monthSchema.safeParse(sourceMonth);
  const parsedTarget = monthSchema.safeParse(targetMonth);
  if (!parsedSource.success || !parsedTarget.success) {
    return { error: "Invalid month format (YYYY-MM)" };
  }

  const householdId = await getHouseholdId();
  const scoped = scopedQuery(householdId, db);

  const sourceBudget = db
    .select({ id: budgets.id })
    .from(budgets)
    .where(scoped.where(budgets, eq(budgets.month, sourceMonth)))
    .get();

  if (!sourceBudget) return { error: "No budget found for source month" };

  // Create or get target budget
  const createResult = await createBudget(targetMonth, db);
  if ("error" in createResult) return createResult;
  const targetBudgetId = createResult.budgetId;

  // Get source categories
  const sourceCats = db
    .select()
    .from(budgetCategories)
    .where(eq(budgetCategories.budgetId, sourceBudget.id))
    .all();

  // Get existing target categories to avoid overwriting
  const existingTargetCats = db
    .select({ categoryId: budgetCategories.categoryId })
    .from(budgetCategories)
    .where(eq(budgetCategories.budgetId, targetBudgetId))
    .all();
  const existingCatIds = new Set(existingTargetCats.map((c) => c.categoryId));

  // Copy only categories not already in target
  for (const cat of sourceCats) {
    if (existingCatIds.has(cat.categoryId)) continue;
    db.insert(budgetCategories)
      .values({
        id: uuid(),
        budgetId: targetBudgetId,
        categoryId: cat.categoryId,
        limitAmount: cat.limitAmount,
        isFixed: cat.isFixed,
      })
      .run();
  }

  revalidatePath("/budgets");
  return { success: true, budgetId: targetBudgetId };
}

export async function updateBudgetType(
  budgetId: string,
  type: "category" | "flex",
  db: LedgrDb = defaultDb,
): Promise<{ success: true } | { error: string }> {
  const parsed = z.enum(["category", "flex"]).safeParse(type);
  if (!parsed.success) return { error: "Invalid budget type" };

  const householdId = await getHouseholdId();
  const owned = verifyBudgetOwnership(budgetId, householdId, db);
  if (!owned) return { error: "Budget not found" };

  db.update(budgets)
    .set({ type, updatedAt: new Date().toISOString() })
    .where(eq(budgets.id, owned.id))
    .run();

  revalidatePath("/budgets");
  return { success: true };
}

export async function toggleFixedCategory(
  budgetCategoryId: string,
  db: LedgrDb = defaultDb,
): Promise<{ success: true; isFixed: boolean } | { error: string }> {
  const householdId = await getHouseholdId();

  // Join through budgets to verify ownership
  const row = db
    .select({
      id: budgetCategories.id,
      isFixed: budgetCategories.isFixed,
      budgetHouseholdId: budgets.householdId,
    })
    .from(budgetCategories)
    .innerJoin(budgets, eq(budgetCategories.budgetId, budgets.id))
    .where(eq(budgetCategories.id, budgetCategoryId))
    .get();

  if (!row || row.budgetHouseholdId !== householdId) {
    return { error: "Budget category not found" };
  }

  const newFixed = !row.isFixed;
  db.update(budgetCategories)
    .set({ isFixed: newFixed })
    .where(eq(budgetCategories.id, row.id))
    .run();

  revalidatePath("/budgets");
  return { success: true, isFixed: newFixed };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/integration/budget-actions.test.ts`
Expected: All 6 tests pass

- [ ] **Step 5: Run full test suite**

Run: `pnpm test --run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/actions/budgets.ts tests/integration/budget-actions.test.ts
git commit -m "feat(budgets): add budget server actions with BOLA-safe ownership checks"
```

---

### Task 7: Install shadcn Progress + Badge Components

**Files:**
- Create: `src/components/ui/progress.tsx`
- Create: `src/components/ui/badge.tsx`

- [ ] **Step 1: Install shadcn components**

Run: `pnpm dlx shadcn@latest add progress badge`
Expected: Two new files created in `src/components/ui/`

- [ ] **Step 2: Verify they exist**

Run: `ls src/components/ui/progress.tsx src/components/ui/badge.tsx`
Expected: Both files listed

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/progress.tsx src/components/ui/badge.tsx
git commit -m "feat(budgets): add shadcn Progress and Badge components"
```

---

### Task 8: BudgetProgressBar Atom

**Files:**
- Create: `src/components/atoms/budget-progress-bar.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/atoms/budget-progress-bar.tsx`:

```tsx
import { Progress } from "@/components/ui/progress";
import { centsToDisplay } from "@/lib/money";
import { budgetProgressPercent } from "@/lib/budget-utils";
import { cn } from "@/lib/utils";

interface BudgetProgressBarProps {
  spent: number;
  limit: number;
  className?: string;
}

export function BudgetProgressBar({ spent, limit, className }: BudgetProgressBarProps) {
  const percent = budgetProgressPercent(spent, limit);
  const remaining = limit - spent;
  const displayValue = Math.min(percent, 100);

  const colorClass =
    percent > 100
      ? "[&>div]:bg-destructive"
      : percent >= 80
        ? "[&>div]:bg-yellow-500"
        : "[&>div]:bg-emerald-500";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Progress value={displayValue} className={cn("h-2 flex-1", colorClass)} />
      <span
        className={cn(
          "text-xs tabular-nums w-16 text-right",
          remaining < 0 && "text-destructive",
        )}
      >
        {centsToDisplay(remaining)}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/components/atoms/budget-progress-bar.tsx
git commit -m "feat(budgets): add BudgetProgressBar atom"
```

---

### Task 9: BudgetSummaryBar + BudgetMonthNav Molecules

**Files:**
- Create: `src/components/molecules/budget-summary-bar.tsx`
- Create: `src/components/molecules/budget-month-nav.tsx`

- [ ] **Step 1: Create BudgetSummaryBar**

Create `src/components/molecules/budget-summary-bar.tsx`:

```tsx
import { BalanceDisplay } from "@/components/atoms/balance-display";
import { cn } from "@/lib/utils";

interface BudgetSummaryBarProps {
  totalBudgeted: number;
  totalSpent: number;
  totalRemaining: number;
  budgetType: "category" | "flex";
  lastSyncedAt: string | null;
}

function timeAgo(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function BudgetSummaryBar({
  totalBudgeted,
  totalSpent,
  totalRemaining,
  budgetType,
  lastSyncedAt,
}: BudgetSummaryBarProps) {
  const labels =
    budgetType === "flex"
      ? ["Fixed Expenses", "Variable Budgeted", "Left to Spend"]
      : ["Total Budgeted", "Total Spent", "Remaining"];

  const values =
    budgetType === "flex"
      ? [totalBudgeted, totalSpent, totalRemaining]
      : [totalBudgeted, totalSpent, totalRemaining];

  return (
    <div className="flex items-center justify-between rounded-lg border bg-card p-4">
      <div className="flex gap-8">
        {labels.map((label, i) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <BalanceDisplay amount={values[i]} size="lg" />
          </div>
        ))}
      </div>
      {lastSyncedAt && (
        <p className="text-xs text-muted-foreground">
          Last synced {timeAgo(lastSyncedAt)}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create BudgetMonthNav**

Create `src/components/molecules/budget-month-nav.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

function formatMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(year, m - 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(year, m - 1 + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

interface BudgetMonthNavProps {
  month?: string;
}

export function BudgetMonthNav({ month }: BudgetMonthNavProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = month ?? searchParams.get("month") ?? getCurrentMonth();

  function navigate(newMonth: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", newMonth);
    router.push(`/budgets?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(shiftMonth(current, -1))}
        aria-label="Previous month"
        className="h-8 w-8 p-0"
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="text-lg font-semibold w-48 text-center">
        {formatMonth(current)}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(shiftMonth(current, 1))}
        aria-label="Next month"
        className="h-8 w-8 p-0"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Verify both compile**

Run: `pnpm typecheck`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/components/molecules/budget-summary-bar.tsx src/components/molecules/budget-month-nav.tsx
git commit -m "feat(budgets): add BudgetSummaryBar and BudgetMonthNav molecules"
```

---

### Task 10: BudgetCategoryRow Molecule (Inline Edit)

**Files:**
- Create: `src/components/molecules/budget-category-row.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/molecules/budget-category-row.tsx`:

```tsx
"use client";

import { useState, useRef, useTransition, useCallback } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AmountDisplay } from "@/components/atoms/amount-display";
import { BudgetProgressBar } from "@/components/atoms/budget-progress-bar";
import { setBudgetCategory, removeBudgetCategory } from "@/actions/budgets";
import { centsToDisplay, parseToCents } from "@/lib/money";
import { cn } from "@/lib/utils";

interface BudgetCategoryRowProps {
  budgetId: string;
  budgetCategoryId: string | null;
  categoryId: string;
  categoryName: string;
  categoryIcon: string | null;
  limitAmount: number;
  spent: number;
  remaining: number;
  onSaved?: () => void;
}

function centsToInputDisplay(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function BudgetCategoryRow({
  budgetId,
  budgetCategoryId,
  categoryId,
  categoryName,
  categoryIcon,
  limitAmount,
  spent,
  remaining,
  onSaved,
}: BudgetCategoryRowProps) {
  const savedValue = useRef(limitAmount);
  const [inputValue, setInputValue] = useState(
    limitAmount > 0 ? centsToInputDisplay(limitAmount) : "",
  );
  const [optimisticLimit, setOptimisticLimit] = useState(limitAmount);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const optimisticRemaining = optimisticLimit - spent;

  const handleSave = useCallback(() => {
    setError(null);
    const trimmed = inputValue.trim();

    if (trimmed === "" && budgetCategoryId) {
      // Remove budget for this category
      setOptimisticLimit(0);
      startTransition(async () => {
        const result = await removeBudgetCategory(budgetId, categoryId);
        if ("error" in result) {
          setOptimisticLimit(savedValue.current);
          setInputValue(centsToInputDisplay(savedValue.current));
          setError(result.error);
        } else {
          savedValue.current = 0;
          onSaved?.();
        }
      });
      return;
    }

    const cents = parseToCents(trimmed);
    if (cents === null && trimmed !== "") {
      setInputValue(centsToInputDisplay(savedValue.current));
      return;
    }

    const newLimit = cents ?? 0;
    if (newLimit === savedValue.current) return;

    setOptimisticLimit(newLimit);
    startTransition(async () => {
      const result = await setBudgetCategory(budgetId, categoryId, newLimit);
      if ("error" in result) {
        setOptimisticLimit(savedValue.current);
        setInputValue(centsToInputDisplay(savedValue.current));
        setError(result.error);
      } else {
        savedValue.current = newLimit;
        onSaved?.();
      }
    });
  }, [inputValue, budgetId, categoryId, budgetCategoryId, onSaved]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      inputRef.current?.blur();
    }
    if (e.key === "Escape") {
      setInputValue(
        savedValue.current > 0 ? centsToInputDisplay(savedValue.current) : "",
      );
      inputRef.current?.blur();
    }
  }

  return (
    <tr className="border-b last:border-b-0">
      <td className="py-2 px-3 text-sm">
        <span className="flex items-center gap-2">
          {categoryIcon && <span>{categoryIcon}</span>}
          {categoryName}
        </span>
      </td>
      <td className="py-2 px-3">
        <div className="relative w-28">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            $
          </span>
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            disabled={isPending}
            aria-label={`Budget for ${categoryName}`}
            className="h-7 pl-5 pr-2 text-xs text-right tabular-nums"
            placeholder="0.00"
          />
        </div>
      </td>
      <td className="py-2 px-3">
        <AmountDisplay amount={spent} className="text-xs" />
      </td>
      <td className="py-2 px-3">
        <span
          className={cn(
            "text-xs tabular-nums font-medium",
            optimisticRemaining < 0 && "text-destructive",
          )}
        >
          {centsToDisplay(optimisticRemaining)}
        </span>
      </td>
      <td className="py-2 px-3 w-32">
        <BudgetProgressBar spent={spent} limit={optimisticLimit} />
      </td>
      <td className="py-2 px-1 w-8">
        {budgetCategoryId && (
          <button
            onClick={() => {
              setInputValue("");
              handleSave();
            }}
            className="text-muted-foreground hover:text-foreground p-0.5"
            aria-label={`Remove budget for ${categoryName}`}
          >
            <X className="size-3" />
          </button>
        )}
      </td>
      {error && (
        <td>
          <span role="alert" aria-live="polite" className="text-xs text-destructive">
            {error}
          </span>
        </td>
      )}
    </tr>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/components/molecules/budget-category-row.tsx
git commit -m "feat(budgets): add BudgetCategoryRow molecule with inline edit + optimistic updates"
```

---

### Task 11: BudgetEmptyState Molecule

**Files:**
- Create: `src/components/molecules/budget-empty-state.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/molecules/budget-empty-state.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createBudget, copyBudgetFromMonth } from "@/actions/budgets";
import { useRouter } from "next/navigation";

interface BudgetEmptyStateProps {
  month: string;
  hasPreviousMonthBudget: boolean;
  previousMonth: string;
}

function formatMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(year, m - 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function BudgetEmptyState({
  month,
  hasPreviousMonthBudget,
  previousMonth,
}: BudgetEmptyStateProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleCreate() {
    startTransition(async () => {
      await createBudget(month);
      router.refresh();
    });
  }

  function handleCopy() {
    startTransition(async () => {
      await copyBudgetFromMonth(previousMonth, month);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Wallet className="size-10 text-muted-foreground mb-3" />
      <h2 className="text-lg font-medium">No budget for {formatMonth(month)}</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-4">
        Set spending limits per category to track your budget.
      </p>
      <div className="flex gap-2">
        <Button onClick={handleCreate} disabled={isPending}>
          Create Budget
        </Button>
        {hasPreviousMonthBudget && (
          <Button variant="outline" onClick={handleCopy} disabled={isPending}>
            Copy from {formatMonth(previousMonth)}
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/components/molecules/budget-empty-state.tsx
git commit -m "feat(budgets): add BudgetEmptyState molecule"
```

---

### Task 12: BudgetGroupSection + BudgetPageHeader Organisms

**Files:**
- Create: `src/components/organisms/budget-group-section.tsx`
- Create: `src/components/organisms/budget-page-header.tsx`

- [ ] **Step 1: Create BudgetGroupSection**

Create `src/components/organisms/budget-group-section.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { BudgetCategoryRow } from "@/components/molecules/budget-category-row";
import { centsToDisplay } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { BudgetCategoryRow as BudgetCatRow } from "@/queries/budgets";

interface BudgetGroupSectionProps {
  budgetId: string;
  groupName: string;
  groupIcon: string | null;
  categories: BudgetCatRow[];
  totalBudgeted: number;
  totalSpent: number;
  defaultCollapsed?: boolean;
  isFixed?: boolean;
  onSaved?: () => void;
}

export function BudgetGroupSection({
  budgetId,
  groupName,
  groupIcon,
  categories,
  totalBudgeted,
  totalSpent,
  defaultCollapsed = false,
  isFixed = false,
  onSaved,
}: BudgetGroupSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className={cn("border rounded-lg", isFixed && "bg-muted/30")}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/50 rounded-t-lg"
      >
        <span className="flex items-center gap-2">
          {collapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
          {groupIcon && <span>{groupIcon}</span>}
          {groupName}
          {isFixed && (
            <span className="text-xs text-muted-foreground font-normal">Fixed</span>
          )}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {centsToDisplay(totalSpent)} / {centsToDisplay(totalBudgeted)}
        </span>
      </button>
      {!collapsed && (
        <table className="w-full">
          <tbody>
            {categories.map((cat) => (
              <BudgetCategoryRow
                key={cat.categoryId}
                budgetId={budgetId}
                budgetCategoryId={cat.budgetCategoryId}
                categoryId={cat.categoryId}
                categoryName={cat.categoryName}
                categoryIcon={cat.categoryIcon}
                limitAmount={cat.limitAmount}
                spent={cat.spent}
                remaining={cat.remaining}
                onSaved={onSaved}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create BudgetPageHeader**

Create `src/components/organisms/budget-page-header.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BudgetMonthNav } from "@/components/molecules/budget-month-nav";
import { updateBudgetType, copyBudgetFromMonth } from "@/actions/budgets";
import { cn } from "@/lib/utils";

interface BudgetPageHeaderProps {
  month: string;
  budgetId: string | null;
  budgetType: "category" | "flex";
  hasPreviousMonthBudget: boolean;
  previousMonth: string;
}

export function BudgetPageHeader({
  month,
  budgetId,
  budgetType,
  hasPreviousMonthBudget,
  previousMonth,
}: BudgetPageHeaderProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleTypeToggle(type: "category" | "flex") {
    if (!budgetId || type === budgetType) return;
    startTransition(async () => {
      await updateBudgetType(budgetId, type);
      router.refresh();
    });
  }

  function handleCopy() {
    startTransition(async () => {
      await copyBudgetFromMonth(previousMonth, month);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Budgets</h1>
        <BudgetMonthNav month={month} />
      </div>
      <div className="flex items-center gap-2">
        {budgetId && (
          <div className="flex rounded-lg border p-0.5">
            <button
              onClick={() => handleTypeToggle("category")}
              disabled={isPending}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                budgetType === "category"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Category
            </button>
            <button
              onClick={() => handleTypeToggle("flex")}
              disabled={isPending}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                budgetType === "flex"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Flex
            </button>
          </div>
        )}
        {hasPreviousMonthBudget && budgetId && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={isPending}
          >
            <Copy className="size-3.5 mr-1.5" />
            Copy from prev
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify both compile**

Run: `pnpm typecheck`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/components/organisms/budget-group-section.tsx src/components/organisms/budget-page-header.tsx
git commit -m "feat(budgets): add BudgetGroupSection and BudgetPageHeader organisms"
```

---

### Task 13: BudgetTable Organism

**Files:**
- Create: `src/components/organisms/budget-table.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/organisms/budget-table.tsx`:

```tsx
"use client";

import { useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BudgetSummaryBar } from "@/components/molecules/budget-summary-bar";
import { BudgetGroupSection } from "@/components/organisms/budget-group-section";
import { AmountDisplay } from "@/components/atoms/amount-display";
import type { BudgetMonth } from "@/queries/budgets";

interface BudgetTableProps {
  data: BudgetMonth;
}

export function BudgetTable({ data }: BudgetTableProps) {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      router.refresh();
    }, 1000);
  }, [router]);

  const budgetType = data.budget?.type ?? "category";

  const fixedGroups = data.groups.filter((g) =>
    g.categories.some((c) => c.isFixed),
  );
  const variableGroups = data.groups.filter((g) =>
    g.categories.some((c) => !c.isFixed),
  );

  return (
    <div className="space-y-4">
      <BudgetSummaryBar
        totalBudgeted={data.summary.totalBudgeted}
        totalSpent={data.summary.totalSpent}
        totalRemaining={data.summary.totalRemaining}
        budgetType={budgetType}
        lastSyncedAt={data.lastSyncedAt}
      />

      {fixedGroups.length > 0 && (
        <div className="space-y-2">
          {fixedGroups.map((group) => (
            <BudgetGroupSection
              key={group.groupId}
              budgetId={data.budget!.id}
              groupName={group.groupName}
              groupIcon={group.groupIcon}
              categories={group.categories.filter((c) => c.isFixed)}
              totalBudgeted={group.totalBudgeted}
              totalSpent={group.totalSpent}
              defaultCollapsed
              isFixed
              onSaved={debouncedRefresh}
            />
          ))}
        </div>
      )}

      <div className="space-y-2">
        {variableGroups.map((group) => (
          <BudgetGroupSection
            key={group.groupId}
            budgetId={data.budget!.id}
            groupName={group.groupName}
            groupIcon={group.groupIcon}
            categories={group.categories.filter((c) => !c.isFixed)}
            totalBudgeted={group.totalBudgeted}
            totalSpent={group.totalSpent}
            onSaved={debouncedRefresh}
          />
        ))}
      </div>

      {data.unbudgeted.categories.length > 0 && (
        <div className="border rounded-lg">
          <div className="flex items-center justify-between px-3 py-2 text-sm font-medium bg-muted/20 rounded-t-lg">
            <span className="text-muted-foreground">Everything Else</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              <AmountDisplay amount={data.unbudgeted.spent} className="text-xs" />
            </span>
          </div>
          <table className="w-full">
            <tbody>
              {data.unbudgeted.categories.map((cat) => (
                <tr key={cat.categoryId} className="border-b last:border-b-0">
                  <td className="py-2 px-3 text-sm text-muted-foreground">
                    {cat.categoryName}
                    {cat.groupName && (
                      <span className="text-xs ml-1">({cat.groupName})</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <AmountDisplay amount={cat.spent} className="text-xs" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/components/organisms/budget-table.tsx
git commit -m "feat(budgets): add BudgetTable organism with debounced refresh"
```

---

### Task 14: Budget Page + Loading + Error + Sidebar Nav

**Files:**
- Create: `src/app/(dashboard)/budgets/page.tsx`
- Create: `src/app/(dashboard)/budgets/loading.tsx`
- Create: `src/app/(dashboard)/budgets/error.tsx`
- Modify: `src/components/organisms/sidebar-nav.tsx:1-20`

- [ ] **Step 1: Create the budget page**

Create `src/app/(dashboard)/budgets/page.tsx`:

```tsx
import { getHouseholdId } from "@/lib/auth/session";
import { getBudgetForMonth } from "@/queries/budgets";
import { BudgetPageHeader } from "@/components/organisms/budget-page-header";
import { BudgetTable } from "@/components/organisms/budget-table";
import { BudgetEmptyState } from "@/components/molecules/budget-empty-state";

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function previousMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(year, m - 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const householdId = await getHouseholdId();
  const params = await searchParams;
  const month =
    typeof params.month === "string" ? params.month : getCurrentMonth();
  const prevMonth = previousMonth(month);

  const data = getBudgetForMonth(householdId, month);
  const prevData = getBudgetForMonth(householdId, prevMonth);
  const hasPrevBudget = prevData.budget !== null;

  return (
    <div className="space-y-4">
      <BudgetPageHeader
        month={month}
        budgetId={data.budget?.id ?? null}
        budgetType={(data.budget?.type ?? "category") as "category" | "flex"}
        hasPreviousMonthBudget={hasPrevBudget}
        previousMonth={prevMonth}
      />

      {data.budget ? (
        <BudgetTable data={data} />
      ) : (
        <BudgetEmptyState
          month={month}
          hasPreviousMonthBudget={hasPrevBudget}
          previousMonth={prevMonth}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create loading skeleton**

Create `src/app/(dashboard)/budgets/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function BudgetsLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-8 w-40" />
      </div>
      <Skeleton className="h-24 w-full rounded-lg" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-40 w-full rounded-lg" />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create error boundary**

Create `src/app/(dashboard)/budgets/error.tsx`:

```tsx
"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BudgetsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <AlertCircle className="h-10 w-10 text-destructive mb-3" />
      <h2 className="text-lg font-medium">Something went wrong</h2>
      <p className="text-sm text-muted-foreground mt-1">
        {error.message || "Failed to load budgets."}
      </p>
      <Button variant="outline" size="sm" onClick={reset} className="mt-4">
        Try Again
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Add Budgets to SidebarNav**

In `src/components/organisms/sidebar-nav.tsx`, add `Wallet` to the Lucide import and add the nav item:

Change the import line:
```ts
import { LayoutDashboard, Building2, ArrowLeftRight, Wallet, LogOut } from "lucide-react";
```

Change the `NAV_ITEMS` array:
```ts
const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Building2 },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/budgets", label: "Budgets", icon: Wallet },
];
```

- [ ] **Step 5: Verify everything compiles**

Run: `pnpm typecheck`
Expected: No type errors

- [ ] **Step 6: Run full test suite**

Run: `pnpm test --run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/budgets/ src/components/organisms/sidebar-nav.tsx
git commit -m "feat(budgets): add budgets page, loading/error states, and sidebar nav entry"
```

---

### Task 15: Manual Smoke Test

**Files:** None (testing only)

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev`
Expected: Server starts on http://localhost:3000

- [ ] **Step 2: Navigate to /budgets**

Open http://localhost:3000/budgets in a browser. Expected:
- Month navigation arrows work (< May 2026 >)
- Empty state shows "Create Budget" button
- "Budgets" appears in sidebar navigation

- [ ] **Step 3: Create a budget**

Click "Create Budget". Expected:
- Page refreshes with empty category groups
- Summary bar shows $0.00 across all totals

- [ ] **Step 4: Test inline editing**

Click a category budget input, type "500", press Tab. Expected:
- Value saves and shows $500.00
- Progress bar appears
- Summary bar updates

- [ ] **Step 5: Test month navigation**

Click right arrow to go to next month. Expected:
- Empty state for new month
- "Copy from [Previous Month]" button appears

- [ ] **Step 6: Test copy from previous month**

Click "Copy from [Previous Month]". Expected:
- All budget limits from previous month appear
- Amounts match

- [ ] **Step 7: Test budget type toggle**

Click "Flex" in the header toggle. Expected:
- Summary bar labels change to "Fixed Expenses" / "Variable Budgeted" / "Left to Spend"

- [ ] **Step 8: Fix any issues found during smoke testing**

Address any visual or functional issues discovered. Commit fixes if needed.

---

### Task 16: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `pnpm test --run`
Expected: All tests pass (including new budget tests)

- [ ] **Step 2: Run type check**

Run: `pnpm typecheck`
Expected: No type errors

- [ ] **Step 3: Run linter**

Run: `pnpm lint`
Expected: No lint errors

- [ ] **Step 4: Verify test count**

Expected new tests:
- 2 tests in `src/lib/money.test.ts` (parseToCents suite)
- 6 tests in `src/lib/budget-utils.test.ts` (including 2 property tests)
- 6 tests in `tests/integration/budget-queries.test.ts`
- 6 tests in `tests/integration/budget-actions.test.ts`
- Total: ~20 new tests
