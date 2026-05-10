# Phase 4: Transactions UI + Categorization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make synced transactions visible, reviewable, and categorizable — completing the Ledgr MVP.

**Architecture:** URL-driven server component page with cursor-based pagination. Optimistic per-row mutations for category/reviewed. Pure categorization engine hooked into post-sync pipeline. Atomic design: atoms (display-only) → molecules (stateful controls) → organisms (composed lists).

**Tech Stack:** Next.js 16 App Router, Drizzle ORM + SQLite, shadcn/ui v4, Tailwind v4, Vitest + fast-check

**Spec:** `docs/superpowers/specs/2026-05-09-transactions-ui-categorization-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/lib/categorization/engine.ts` | Pure categorization function + DB-aware wrapper |
| `src/lib/categorization/engine.test.ts` | Unit + property tests for categorization |
| `src/queries/transactions.ts` | Transaction queries with filters + cursor pagination |
| `src/queries/categories.ts` | Category queries grouped by category group |
| `src/actions/transactions.ts` | Server actions for category/reviewed mutations |
| `src/components/atoms/amount-display.tsx` | Color-coded amount display |
| `src/components/molecules/category-picker.tsx` | Compact Select with optimistic update |
| `src/components/molecules/reviewed-checkbox.tsx` | Dot toggle with optimistic update |
| `src/components/molecules/transaction-row.tsx` | Dense transaction row |
| `src/components/molecules/transaction-filters.tsx` | URL-driven filter bar |
| `src/components/molecules/transaction-empty-state.tsx` | Context-aware empty state |
| `src/components/molecules/bulk-action-bar.tsx` | Sticky bulk action bar |
| `src/components/organisms/transaction-list.tsx` | Paginated list + selection + bulk |
| `src/app/(dashboard)/transactions/page.tsx` | Server component page |
| `src/app/(dashboard)/transactions/loading.tsx` | Skeleton loading state |
| `src/app/(dashboard)/transactions/error.tsx` | Error boundary |
| `tests/integration/helpers.ts` | Shared test data factories |
| `tests/integration/helpers.test.ts` | Factory smoke tests |
| `tests/integration/transaction-queries.test.ts` | Query integration tests |
| `tests/integration/transaction-actions.test.ts` | Action integration tests |
| `tests/integration/categorization-sync.test.ts` | Categorization-in-sync tests |

### Modified Files
| File | What Changes |
|------|-------------|
| `src/lib/money.ts:12` | Remove `"depository"` from `FLIP_SIGN_TYPES` |
| `src/actions/plaid.ts:233-266` | Add `db` param to `updateAccount`, scope the write |
| `src/actions/sync.ts:34` | Add `revalidatePath("/transactions")` |
| `src/lib/plaid/sync.ts:50-65` | Remove `plaidCategory`/`plaidCategoryDetailed` from TransactionRow |
| `src/lib/plaid/sync.ts:242-243` | Remove dead plaidCategory computation from `toRow` |
| `src/lib/plaid/sync.ts:421-434` | Preserve `categoryId`/`reviewed` in upsert SET |
| `src/lib/plaid/sync.ts:462-468` | Copy category from pending before soft-delete |
| `src/lib/plaid/sync.ts:497-501` | Add status reset inside applyToDb transaction |
| `src/lib/plaid/sync.ts:616-620` | Remove redundant status reset from doSync |
| `src/lib/plaid/sync.ts:614` | Add `categorizeSyncedTransactions` call after applyToDb |
| `src/components/organisms/sidebar-nav.tsx:16-19` | Add Transactions nav item |

---

## Task 1: Pre-Phase 4 Refactoring — money.ts + plaid.ts

**Files:**
- Modify: `src/lib/money.ts:12`
- Modify: `src/actions/plaid.ts:233-266`

- [ ] **Step 1: Fix FLIP_SIGN_TYPES in money.ts**

```typescript
// src/lib/money.ts — line 12
// BEFORE:
const FLIP_SIGN_TYPES = new Set(["depository", "checking", "savings", "other"]);
// AFTER:
const FLIP_SIGN_TYPES = new Set(["checking", "savings", "other"]);
```

- [ ] **Step 2: Run existing money tests**

Run: `pnpm vitest run src/lib/money.test.ts`
Expected: All tests pass (the "depository" value was never used by the test suite or schema)

- [ ] **Step 3: Fix updateAccount in plaid.ts — add db param and scope the write**

```typescript
// src/actions/plaid.ts — replace the updateAccount function (lines 233-266)
export async function updateAccount(
  accountId: string,
  data: UpdateAccountInput,
  db: LedgrDb = defaultDb,
) {
  const householdId = await getHouseholdId();
  const parsed = updateAccountSchema.safeParse(data);
  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  const scoped = scopedQuery(householdId, db);
  const existing = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(scoped.where(accounts, eq(accounts.id, accountId)))
    .get();

  if (!existing) {
    return { error: "Account not found" };
  }

  const updates: Partial<typeof accounts.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.isHidden !== undefined) updates.isHidden = parsed.data.isHidden;

  if (Object.keys(updates).length > 0) {
    db.update(accounts)
      .set(updates)
      .where(scoped.where(accounts, eq(accounts.id, accountId)))
      .run();
  }

  revalidatePath("/accounts");
  return { success: true };
}
```

- [ ] **Step 4: Run full test suite**

Run: `pnpm vitest run`
Expected: All existing tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/money.ts src/actions/plaid.ts
git commit -m "fix: remove dead 'depository' from FLIP_SIGN_TYPES + add db param to updateAccount"
```

---

## Task 2: Pre-Phase 4 Refactoring — sync.ts fixes

**Files:**
- Modify: `src/lib/plaid/sync.ts:50-65,242-243,421-434,462-468,497-501,616-620`
- Modify: `src/actions/sync.ts:34`

- [ ] **Step 1: Remove plaidCategory fields from TransactionRow interface**

```typescript
// src/lib/plaid/sync.ts — lines 50-65, replace the interface
interface TransactionRow {
  plaidTransactionId: string;
  plaidAccountId: string;
  date: string;
  originalName: string;
  name: string;
  amount: number;
  normalizedAmount: number;
  currency: string;
  pending: boolean;
  pendingTransactionId: string | null;
  merchantName: string | null;
  logoUrl: string | null;
}
```

- [ ] **Step 2: Remove plaidCategory computation from toRow function**

```typescript
// src/lib/plaid/sync.ts — lines 225-244, replace the toRow function
  function toRow(txn: PlaidTransaction): TransactionRow {
    const amountCents = plaidAmountToCents(txn.amount)!;
    const accountType = accountTypeMap.get(txn.account_id) ?? "other";
    const normalizedAmt = normalizeAmount(amountCents, accountType);
    return {
      plaidTransactionId: txn.transaction_id,
      plaidAccountId: txn.account_id,
      date: txn.date,
      originalName: txn.name,
      name: txn.merchant_name ? titleCase(txn.merchant_name) : txn.name,
      amount: amountCents,
      normalizedAmount: normalizedAmt,
      currency: txn.iso_currency_code ?? "USD",
      pending: txn.pending,
      pendingTransactionId: txn.pending_transaction_id ?? null,
      merchantName: txn.merchant_name ? titleCase(txn.merchant_name) : null,
      logoUrl: txn.logo_url ?? null,
    };
  }
```

- [ ] **Step 3: Preserve categoryId/reviewed in modified transaction upsert**

```typescript
// src/lib/plaid/sync.ts — lines 415-437, replace the existing upsert block
      const existingTxn = tx
        .select({
          id: transactions.id,
          categoryId: transactions.categoryId,
          reviewed: transactions.reviewed,
        })
        .from(transactions)
        .where(eq(transactions.plaidTransactionId, row.plaidTransactionId))
        .get();

      if (existingTxn) {
        tx.update(transactions)
          .set({
            accountId: internalAccountId,
            merchantId,
            date: row.date,
            originalName: row.originalName,
            name: row.name,
            amount: row.amount,
            normalizedAmount: row.normalizedAmount,
            currency: row.currency,
            pending: row.pending,
            pendingTransactionId: row.pendingTransactionId,
            updatedAt: now,
            // Preserve user's manual categorization and reviewed status
          })
          .where(eq(transactions.id, existingTxn.id))
          .run();
      } else {
```

- [ ] **Step 4: Copy category from pending transaction before soft-delete**

```typescript
// src/lib/plaid/sync.ts — lines 462-468, replace the pending→posted block
    // --- Soft-delete pending→posted replacements, inheriting category ---
    for (const pendingPlaidId of processed.pendingToRemove) {
      const pendingRow = tx
        .select({
          categoryId: transactions.categoryId,
          reviewed: transactions.reviewed,
        })
        .from(transactions)
        .where(eq(transactions.plaidTransactionId, pendingPlaidId))
        .get();

      tx.update(transactions)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(transactions.plaidTransactionId, pendingPlaidId))
        .run();

      // If the pending transaction was manually categorized, copy to the posted version
      if (pendingRow?.categoryId) {
        const postedTxn = tx
          .select({ id: transactions.id })
          .from(transactions)
          .where(
            and(
              eq(transactions.pendingTransactionId, pendingPlaidId),
              isNull(transactions.deletedAt),
            ),
          )
          .get();

        if (postedTxn) {
          tx.update(transactions)
            .set({
              categoryId: pendingRow.categoryId,
              reviewed: pendingRow.reviewed,
              updatedAt: now,
            })
            .where(eq(transactions.id, postedTxn.id))
            .run();
        }
      }
    }
```

Add `isNull` to the import at the top of sync.ts:

```typescript
// src/lib/plaid/sync.ts — line 1
import { eq, and, isNull } from "drizzle-orm";
```

- [ ] **Step 5: Move status reset inside applyToDb transaction**

```typescript
// src/lib/plaid/sync.ts — after the sync_log write (line 514), add before the return:
    // --- Reset item status to active ---
    tx.update(plaidItems)
      .set({ status: "active", errorCode: null, updatedAt: now })
      .where(eq(plaidItems.id, itemId))
      .run();

    return { addedCount, modifiedCount, removedCount };
```

Then remove the redundant status update from doSync:

```typescript
// src/lib/plaid/sync.ts — lines 616-620, DELETE these lines:
    // db.update(plaidItems)
    //   .set({ status: "active", errorCode: null, updatedAt: now })
    //   .where(eq(plaidItems.id, itemId))
    //   .run();
```

- [ ] **Step 6: Add revalidatePath("/transactions") to triggerSync**

```typescript
// src/actions/sync.ts — line 34, add after the existing revalidatePath:
  revalidatePath("/accounts");
  revalidatePath("/transactions");
```

- [ ] **Step 7: Run all sync tests**

Run: `pnpm vitest run src/lib/plaid/sync.test.ts tests/integration/transaction-sync.test.ts`
Expected: All existing sync tests pass

- [ ] **Step 8: Commit**

```bash
git add src/lib/plaid/sync.ts src/actions/sync.ts
git commit -m "fix: preserve categoryId in upserts, inherit category on pending→posted, atomize status reset"
```

---

## Task 3: Test Helpers

**Files:**
- Create: `tests/integration/helpers.ts`
- Create: `tests/integration/helpers.test.ts`

- [ ] **Step 1: Create shared test data factories**

```typescript
// tests/integration/helpers.ts
import { v4 as uuid } from "uuid";
import type { LedgrDb } from "../../src/db";
import {
  households,
  householdMembers,
  accounts,
  transactions,
  merchants,
  categoryGroups,
  categories,
  categoryRules,
} from "../../src/db/schema";

export function insertHousehold(db: LedgrDb, name = "Test Household") {
  const id = uuid();
  db.insert(households).values({ id, name }).run();
  return { householdId: id };
}

export function insertAccount(
  db: LedgrDb,
  householdId: string,
  overrides: Partial<typeof accounts.$inferInsert> = {},
) {
  const id = uuid();
  db.insert(accounts)
    .values({
      id,
      householdId,
      name: "Test Account",
      type: "checking",
      currency: "USD",
      ...overrides,
    })
    .run();
  return { accountId: id };
}

export function insertTransaction(
  db: LedgrDb,
  householdId: string,
  accountId: string,
  overrides: Partial<typeof transactions.$inferInsert> = {},
) {
  const id = uuid();
  const now = new Date().toISOString();
  db.insert(transactions)
    .values({
      id,
      accountId,
      householdId,
      date: "2026-05-01",
      originalName: "Test Transaction",
      name: "Test Transaction",
      amount: -1000,
      normalizedAmount: 1000,
      currency: "USD",
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .run();
  return { transactionId: id };
}

export function insertMerchant(
  db: LedgrDb,
  householdId: string,
  overrides: Partial<typeof merchants.$inferInsert> = {},
) {
  const id = uuid();
  const now = new Date().toISOString();
  db.insert(merchants)
    .values({
      id,
      householdId,
      name: "Test Merchant",
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .run();
  return { merchantId: id };
}

export function insertCategoryGroup(
  db: LedgrDb,
  householdId: string,
  overrides: Partial<typeof categoryGroups.$inferInsert> = {},
) {
  const id = uuid();
  db.insert(categoryGroups)
    .values({
      id,
      householdId,
      name: "Test Group",
      ...overrides,
    })
    .run();
  return { groupId: id };
}

export function insertCategory(
  db: LedgrDb,
  householdId: string,
  groupId: string,
  overrides: Partial<typeof categories.$inferInsert> = {},
) {
  const id = uuid();
  db.insert(categories)
    .values({
      id,
      householdId,
      groupId,
      name: "Test Category",
      ...overrides,
    })
    .run();
  return { categoryId: id };
}

export function insertCategoryRule(
  db: LedgrDb,
  householdId: string,
  categoryId: string,
  overrides: Partial<typeof categoryRules.$inferInsert> = {},
) {
  const id = uuid();
  db.insert(categoryRules)
    .values({
      id,
      householdId,
      categoryId,
      matchPattern: "test",
      ...overrides,
    })
    .run();
  return { ruleId: id };
}
```

- [ ] **Step 2: Create smoke test for factories**

```typescript
// tests/integration/helpers.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertTransaction,
  insertMerchant,
  insertCategoryGroup,
  insertCategory,
  insertCategoryRule,
} from "./helpers";
import { households, accounts, transactions, merchants, categoryGroups, categories, categoryRules } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import type { LedgrDb } from "../../src/db";

describe("test helpers", () => {
  let db: LedgrDb;
  let close: () => void;

  beforeAll(() => {
    const testDb = createTestDb();
    db = testDb.db;
    close = testDb.close;
  });

  afterAll(() => close());

  it("creates full FK chain: household → account → transaction", () => {
    const { householdId } = insertHousehold(db);
    const { accountId } = insertAccount(db, householdId);
    const { transactionId } = insertTransaction(db, householdId, accountId);

    const row = db.select().from(transactions).where(eq(transactions.id, transactionId)).get();
    expect(row).toBeDefined();
    expect(row!.householdId).toBe(householdId);
    expect(row!.accountId).toBe(accountId);
  });

  it("creates merchant with household FK", () => {
    const { householdId } = insertHousehold(db);
    const { merchantId } = insertMerchant(db, householdId);

    const row = db.select().from(merchants).where(eq(merchants.id, merchantId)).get();
    expect(row).toBeDefined();
    expect(row!.householdId).toBe(householdId);
  });

  it("creates category chain: group → category → rule", () => {
    const { householdId } = insertHousehold(db);
    const { groupId } = insertCategoryGroup(db, householdId);
    const { categoryId } = insertCategory(db, householdId, groupId);
    const { ruleId } = insertCategoryRule(db, householdId, categoryId);

    const rule = db.select().from(categoryRules).where(eq(categoryRules.id, ruleId)).get();
    expect(rule).toBeDefined();
    expect(rule!.categoryId).toBe(categoryId);
  });
});
```

- [ ] **Step 3: Run smoke tests**

Run: `pnpm vitest run tests/integration/helpers.test.ts`
Expected: All 3 tests pass

- [ ] **Step 4: Commit**

```bash
git add tests/integration/helpers.ts tests/integration/helpers.test.ts
git commit -m "test: add shared test data factories with FK chain support"
```

---

## Task 4: Categorization Engine — Pure Function

**Files:**
- Create: `src/lib/categorization/engine.ts`
- Create: `src/lib/categorization/engine.test.ts`

- [ ] **Step 1: Write failing unit tests**

```typescript
// src/lib/categorization/engine.test.ts
import { describe, it, expect } from "vitest";
import { test } from "@fast-check/vitest";
import * as fc from "fast-check";
import {
  categorizeTransactions,
  type CategorizableTransaction,
  type CategoryRule,
} from "./engine";

function makeTxn(overrides: Partial<CategorizableTransaction> = {}): CategorizableTransaction {
  return {
    id: "txn-1",
    name: "Whole Foods Market",
    merchantId: null,
    merchantName: null,
    merchantCategoryId: null,
    ...overrides,
  };
}

function makeRule(overrides: Partial<CategoryRule> = {}): CategoryRule {
  return {
    id: "rule-1",
    categoryId: "cat-groceries",
    matchField: "name",
    matchPattern: "whole foods",
    priority: 0,
    ...overrides,
  };
}

describe("categorizeTransactions", () => {
  it("matches a name rule (case-insensitive substring)", () => {
    const txns = [makeTxn({ name: "WHOLE FOODS MARKET #123" })];
    const rules = [makeRule({ matchPattern: "whole foods" })];

    const result = categorizeTransactions(txns, rules);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      transactionId: "txn-1",
      categoryId: "cat-groceries",
      source: "rule",
    });
  });

  it("matches a merchant rule against merchantName", () => {
    const txns = [makeTxn({ merchantName: "Spotify", merchantId: "m-1" })];
    const rules = [makeRule({ matchField: "merchant", matchPattern: "spotify", categoryId: "cat-subs" })];

    const result = categorizeTransactions(txns, rules);

    expect(result).toHaveLength(1);
    expect(result[0].categoryId).toBe("cat-subs");
    expect(result[0].source).toBe("rule");
  });

  it("higher priority rule wins over lower", () => {
    const txns = [makeTxn({ name: "Starbucks Coffee" })];
    const rules = [
      makeRule({ id: "r-low", matchPattern: "starbucks", categoryId: "cat-dining", priority: 0 }),
      makeRule({ id: "r-high", matchPattern: "starbucks", categoryId: "cat-coffee", priority: 10 }),
    ];

    const result = categorizeTransactions(txns, rules);

    expect(result).toHaveLength(1);
    expect(result[0].categoryId).toBe("cat-coffee");
  });

  it("falls back to merchant default when no rule matches", () => {
    const txns = [makeTxn({ name: "XYZ Corp", merchantCategoryId: "cat-misc", merchantId: "m-1" })];
    const rules = [makeRule({ matchPattern: "no-match" })];

    const result = categorizeTransactions(txns, rules);

    expect(result).toHaveLength(1);
    expect(result[0].categoryId).toBe("cat-misc");
    expect(result[0].source).toBe("merchant_default");
  });

  it("returns empty array when nothing matches and no merchant default", () => {
    const txns = [makeTxn({ name: "Unknown Store" })];
    const rules = [makeRule({ matchPattern: "no-match" })];

    const result = categorizeTransactions(txns, rules);

    expect(result).toHaveLength(0);
  });

  it("returns empty array when rules list is empty", () => {
    const txns = [makeTxn()];

    const result = categorizeTransactions(txns, []);

    expect(result).toHaveLength(0);
  });

  // Property-based tests
  test.prop(
    [
      fc.integer({ min: 0, max: 100 }),
      fc.integer({ min: 0, max: 100 }),
    ],
  )("higher priority always wins regardless of insertion order", (pA, pB) => {
    fc.pre(pA !== pB);
    const highPriority = Math.max(pA, pB);
    const lowPriority = Math.min(pA, pB);
    const txns = [makeTxn({ name: "test" })];
    const rules = [
      makeRule({ id: "r-low", matchPattern: "test", categoryId: "cat-low", priority: lowPriority }),
      makeRule({ id: "r-high", matchPattern: "test", categoryId: "cat-high", priority: highPriority }),
    ];

    const result = categorizeTransactions(txns, rules);

    expect(result).toHaveLength(1);
    expect(result[0].categoryId).toBe("cat-high");
  });

  test.prop(
    [fc.array(fc.record({ name: fc.string({ minLength: 1 }) }), { minLength: 1, maxLength: 20 })],
  )("output length never exceeds input length", (rawTxns) => {
    const txns = rawTxns.map((t, i) => makeTxn({ id: `txn-${i}`, name: t.name }));
    const rules = [makeRule({ matchPattern: "a" })];

    const result = categorizeTransactions(txns, rules);

    expect(result.length).toBeLessThanOrEqual(txns.length);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/categorization/engine.test.ts`
Expected: FAIL — module `./engine` not found

- [ ] **Step 3: Implement the categorization engine**

```typescript
// src/lib/categorization/engine.ts
export interface CategorizableTransaction {
  id: string;
  name: string;
  merchantId: string | null;
  merchantName: string | null;
  merchantCategoryId: string | null;
}

export interface CategoryRule {
  id: string;
  categoryId: string;
  matchField: "name" | "merchant";
  matchPattern: string;
  priority: number;
}

export interface CategoryAssignment {
  transactionId: string;
  categoryId: string;
  source: "rule" | "merchant_default";
}

export function categorizeTransactions(
  transactions: CategorizableTransaction[],
  rules: CategoryRule[],
): CategoryAssignment[] {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  const assignments: CategoryAssignment[] = [];

  for (const txn of transactions) {
    let matched = false;

    for (const rule of sorted) {
      const target =
        rule.matchField === "merchant" ? txn.merchantName : txn.name;
      if (!target) continue;

      if (target.toLowerCase().includes(rule.matchPattern.toLowerCase())) {
        assignments.push({
          transactionId: txn.id,
          categoryId: rule.categoryId,
          source: "rule",
        });
        matched = true;
        break;
      }
    }

    if (!matched && txn.merchantCategoryId) {
      assignments.push({
        transactionId: txn.id,
        categoryId: txn.merchantCategoryId,
        source: "merchant_default",
      });
    }
  }

  return assignments;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/categorization/engine.test.ts`
Expected: All 8 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/categorization/engine.ts src/lib/categorization/engine.test.ts
git commit -m "feat: add pure categorization engine with rule priority + merchant fallback"
```

---

## Task 5: Category Queries

**Files:**
- Create: `src/queries/categories.ts`

- [ ] **Step 1: Implement getCategories**

```typescript
// src/queries/categories.ts
import { db as defaultDb, type LedgrDb } from "@/db";
import { categoryGroups, categories } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";

export interface CategoryOption {
  id: string;
  name: string;
  icon: string | null;
  isIncome: boolean;
  sortOrder: number;
}

export interface CategoryGroup {
  id: string;
  name: string;
  icon: string | null;
  sortOrder: number;
  categories: CategoryOption[];
}

export function getCategories(
  householdId: string,
  db: LedgrDb = defaultDb,
): CategoryGroup[] {
  const scoped = scopedQuery(householdId, db);

  const groups = db
    .select()
    .from(categoryGroups)
    .where(scoped.where(categoryGroups))
    .orderBy(categoryGroups.sortOrder)
    .all();

  const cats = db
    .select()
    .from(categories)
    .where(scoped.where(categories))
    .orderBy(categories.sortOrder)
    .all();

  const catsByGroup = new Map<string, CategoryOption[]>();
  for (const cat of cats) {
    const list = catsByGroup.get(cat.groupId) ?? [];
    list.push({
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
      isIncome: cat.isIncome ?? false,
      sortOrder: cat.sortOrder ?? 0,
    });
    catsByGroup.set(cat.groupId, list);
  }

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    icon: g.icon,
    sortOrder: g.sortOrder ?? 0,
    categories: catsByGroup.get(g.id) ?? [],
  }));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/queries/categories.ts
git commit -m "feat: add getCategories query grouped by category group"
```

---

## Task 6: Transaction Queries

**Files:**
- Create: `src/queries/transactions.ts`
- Create: `tests/integration/transaction-queries.test.ts`

- [ ] **Step 1: Write the integration tests first**

```typescript
// tests/integration/transaction-queries.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertTransaction,
  insertCategoryGroup,
  insertCategory,
  insertMerchant,
} from "./helpers";
import { getTransactions } from "../../src/queries/transactions";
import { transactions } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import type { LedgrDb } from "../../src/db";

describe("getTransactions", () => {
  let db: LedgrDb;
  let close: () => void;
  let householdId: string;
  let accountId: string;
  let categoryId: string;

  beforeAll(() => {
    const testDb = createTestDb();
    db = testDb.db;
    close = testDb.close;

    ({ householdId } = insertHousehold(db));
    ({ accountId } = insertAccount(db, householdId, { name: "Chase Checking" }));
    const { groupId } = insertCategoryGroup(db, householdId, { name: "Food" });
    ({ categoryId } = insertCategory(db, householdId, groupId, { name: "Groceries" }));

    // Insert 5 transactions with varying dates
    insertTransaction(db, householdId, accountId, { name: "Whole Foods", date: "2026-05-01", amount: -4500, normalizedAmount: 4500 });
    insertTransaction(db, householdId, accountId, { name: "Target", date: "2026-05-02", amount: -2300, normalizedAmount: 2300, categoryId });
    insertTransaction(db, householdId, accountId, { name: "Payroll", date: "2026-05-03", amount: 320000, normalizedAmount: -320000, reviewed: true });
    insertTransaction(db, householdId, accountId, { name: "Amazon", date: "2026-05-04", amount: -1500, normalizedAmount: 1500 });
    insertTransaction(db, householdId, accountId, { name: "Spotify", date: "2026-05-05", amount: -999, normalizedAmount: 999, pending: true });
  });

  afterAll(() => close());

  it("returns non-deleted transactions for the household", () => {
    const page = getTransactions(householdId, {}, 50, null, db);
    expect(page.rows).toHaveLength(5);
    expect(page.rows[0].date).toBe("2026-05-05"); // most recent first
  });

  it("filters by date range", () => {
    const page = getTransactions(householdId, { dateFrom: "2026-05-02", dateTo: "2026-05-04" }, 50, null, db);
    expect(page.rows).toHaveLength(3);
  });

  it("filters by categoryId", () => {
    const page = getTransactions(householdId, { categoryId }, 50, null, db);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0].name).toBe("Target");
  });

  it("filters by categoryId null (uncategorized)", () => {
    const page = getTransactions(householdId, { categoryId: null }, 50, null, db);
    // Whole Foods, Payroll, Amazon, Spotify = 4 uncategorized
    expect(page.rows).toHaveLength(4);
  });

  it("filters by reviewed status", () => {
    const page = getTransactions(householdId, { reviewed: true }, 50, null, db);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0].name).toBe("Payroll");
  });

  it("filters by search substring (case-insensitive)", () => {
    const page = getTransactions(householdId, { search: "whole" }, 50, null, db);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0].name).toBe("Whole Foods");
  });

  it("paginates with cursor — no overlap", () => {
    const page1 = getTransactions(householdId, {}, 2, null, db);
    expect(page1.rows).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = getTransactions(householdId, {}, 2, page1.nextCursor, db);
    expect(page2.rows).toHaveLength(2);

    const page1Ids = new Set(page1.rows.map((r) => r.id));
    for (const row of page2.rows) {
      expect(page1Ids.has(row.id)).toBe(false);
    }
  });

  it("handles malformed cursor by returning first page", () => {
    const page = getTransactions(householdId, {}, 50, "not-valid-base64!!", db);
    expect(page.rows).toHaveLength(5);
  });

  it("enforces household isolation", () => {
    const { householdId: otherId } = insertHousehold(db, "Other Household");
    const { accountId: otherAcct } = insertAccount(db, otherId);
    insertTransaction(db, otherId, otherAcct, { name: "Other's Transaction" });

    const page = getTransactions(householdId, {}, 50, null, db);
    expect(page.rows.every((r) => r.name !== "Other's Transaction")).toBe(true);
  });

  it("joins category name and account name", () => {
    const page = getTransactions(householdId, { categoryId }, 50, null, db);
    expect(page.rows[0].categoryName).toBe("Groceries");
    expect(page.rows[0].categoryGroupName).toBe("Food");
    expect(page.rows[0].accountName).toBe("Chase Checking");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/integration/transaction-queries.test.ts`
Expected: FAIL — module `../../src/queries/transactions` not found

- [ ] **Step 3: Implement getTransactions**

```typescript
// src/queries/transactions.ts
import { eq, and, like, gte, lte, isNull, desc, sql, type SQL } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { transactions, categories, categoryGroups, merchants, accounts, transactionSplits } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";

export interface TransactionFilters {
  dateFrom?: string;
  dateTo?: string;
  accountId?: string;
  categoryId?: string | null;
  reviewed?: boolean;
  search?: string;
}

export interface TransactionRow {
  id: string;
  date: string;
  name: string;
  originalName: string;
  amount: number;
  normalizedAmount: number;
  currency: string;
  pending: boolean;
  reviewed: boolean;
  accountId: string;
  accountName: string;
  merchantId: string | null;
  merchantName: string | null;
  merchantLogoUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryGroupName: string | null;
  categoryIcon: string | null;
  notes: string | null;
  hasSplits: boolean;
}

export interface TransactionPage {
  rows: TransactionRow[];
  nextCursor: string | null;
}

function encodeCursor(date: string, id: string): string {
  return Buffer.from(JSON.stringify({ date, id })).toString("base64");
}

function decodeCursor(cursor: string): { date: string; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64").toString());
    if (typeof parsed.date === "string" && typeof parsed.id === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function getTransactions(
  householdId: string,
  filters: TransactionFilters = {},
  limit = 50,
  cursor: string | null = null,
  db: LedgrDb = defaultDb,
): TransactionPage {
  const scoped = scopedQuery(householdId, db);
  const conditions: (SQL | undefined)[] = [notDeleted(transactions)];

  if (filters.dateFrom) {
    conditions.push(gte(transactions.date, filters.dateFrom));
  }
  if (filters.dateTo) {
    conditions.push(lte(transactions.date, filters.dateTo));
  }
  if (filters.accountId) {
    conditions.push(eq(transactions.accountId, filters.accountId));
  }
  if (filters.categoryId === null) {
    conditions.push(isNull(transactions.categoryId));
  } else if (filters.categoryId !== undefined) {
    conditions.push(eq(transactions.categoryId, filters.categoryId));
  }
  if (filters.reviewed !== undefined) {
    conditions.push(eq(transactions.reviewed, filters.reviewed));
  }
  if (filters.search) {
    conditions.push(like(transactions.name, `%${filters.search}%`));
  }

  const decoded = cursor ? decodeCursor(cursor) : null;
  if (decoded) {
    conditions.push(
      sql`(${transactions.date} < ${decoded.date} OR (${transactions.date} = ${decoded.date} AND ${transactions.id} < ${decoded.id}))`,
    );
  }

  const rows = db
    .select({
      id: transactions.id,
      date: transactions.date,
      name: transactions.name,
      originalName: transactions.originalName,
      amount: transactions.amount,
      normalizedAmount: transactions.normalizedAmount,
      currency: transactions.currency,
      pending: transactions.pending,
      reviewed: transactions.reviewed,
      accountId: transactions.accountId,
      accountName: accounts.name,
      merchantId: transactions.merchantId,
      merchantName: merchants.name,
      merchantLogoUrl: merchants.logoUrl,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryGroupName: categoryGroups.name,
      categoryIcon: categories.icon,
      notes: transactions.notes,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(categoryGroups, eq(categories.groupId, categoryGroups.id))
    .where(scoped.where(transactions, ...conditions))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  // Check for splits
  const result: TransactionRow[] = pageRows.map((row) => {
    const splitCount = db
      .select({ count: sql<number>`count(*)` })
      .from(transactionSplits)
      .where(eq(transactionSplits.transactionId, row.id))
      .get();

    return {
      ...row,
      pending: Boolean(row.pending),
      reviewed: Boolean(row.reviewed),
      hasSplits: (splitCount?.count ?? 0) > 0,
    };
  });

  const nextCursor = hasMore
    ? encodeCursor(pageRows[pageRows.length - 1].date, pageRows[pageRows.length - 1].id)
    : null;

  return { rows: result, nextCursor };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/integration/transaction-queries.test.ts`
Expected: All 10 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/queries/transactions.ts tests/integration/transaction-queries.test.ts
git commit -m "feat: add getTransactions query with filters, cursor pagination, and joins"
```

---

## Task 7: Transaction Server Actions

**Files:**
- Create: `src/actions/transactions.ts`
- Create: `tests/integration/transaction-actions.test.ts`

- [ ] **Step 1: Write integration tests**

```typescript
// tests/integration/transaction-actions.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertTransaction,
  insertCategoryGroup,
  insertCategory,
} from "./helpers";
import {
  updateTransactionCategory,
  toggleReviewed,
  bulkUpdateCategory,
  bulkMarkReviewed,
} from "../../src/actions/transactions";
import { transactions } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import type { LedgrDb } from "../../src/db";

// Mock auth + revalidation
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let mockHouseholdId: string;
vi.mock("../../src/lib/auth/session", () => ({
  getHouseholdId: vi.fn(() => Promise.resolve(mockHouseholdId)),
}));

describe("transaction actions", () => {
  let db: LedgrDb;
  let close: () => void;
  let accountId: string;
  let categoryId: string;
  let txnId: string;

  beforeAll(() => {
    const testDb = createTestDb();
    db = testDb.db;
    close = testDb.close;

    const hh = insertHousehold(db);
    mockHouseholdId = hh.householdId;
    ({ accountId } = insertAccount(db, hh.householdId));
    const { groupId } = insertCategoryGroup(db, hh.householdId);
    ({ categoryId } = insertCategory(db, hh.householdId, groupId, { name: "Groceries" }));
  });

  afterAll(() => close());

  describe("updateTransactionCategory", () => {
    it("sets categoryId and marks reviewed=true", async () => {
      const { transactionId } = insertTransaction(db, mockHouseholdId, accountId);
      txnId = transactionId;

      const result = await updateTransactionCategory(transactionId, categoryId, db);
      expect(result).toEqual({ success: true });

      const row = db.select().from(transactions).where(eq(transactions.id, transactionId)).get();
      expect(row!.categoryId).toBe(categoryId);
      expect(row!.reviewed).toBe(true);
    });

    it("clearing category (null) preserves reviewed status", async () => {
      const result = await updateTransactionCategory(txnId, null, db);
      expect(result).toEqual({ success: true });

      const row = db.select().from(transactions).where(eq(transactions.id, txnId)).get();
      expect(row!.categoryId).toBeNull();
      expect(row!.reviewed).toBe(true); // NOT reset to false
    });
  });

  describe("toggleReviewed", () => {
    it("flips reviewed boolean and returns new value", async () => {
      const { transactionId } = insertTransaction(db, mockHouseholdId, accountId, { reviewed: false });

      const result = await toggleReviewed(transactionId, db);
      expect(result).toEqual({ success: true, reviewed: true });

      const result2 = await toggleReviewed(transactionId, db);
      expect(result2).toEqual({ success: true, reviewed: false });
    });
  });

  describe("bulkUpdateCategory", () => {
    it("only updates transactions belonging to the session household", async () => {
      const { transactionId: ownTxn } = insertTransaction(db, mockHouseholdId, accountId);

      // Create another household's transaction
      const { householdId: otherId } = insertHousehold(db, "Other");
      const { accountId: otherAcct } = insertAccount(db, otherId);
      const { transactionId: otherTxn } = insertTransaction(db, otherId, otherAcct);

      const result = await bulkUpdateCategory([ownTxn, otherTxn], categoryId, db);
      expect(result).toEqual({ success: true, updatedCount: 1 });

      const otherRow = db.select().from(transactions).where(eq(transactions.id, otherTxn)).get();
      expect(otherRow!.categoryId).toBeNull(); // untouched
    });

    it("returns error when exceeding 500 items", async () => {
      const ids = Array.from({ length: 501 }, (_, i) => `fake-id-${i}`);
      const result = await bulkUpdateCategory(ids, categoryId, db);
      expect(result).toHaveProperty("error");
    });
  });

  describe("bulkMarkReviewed", () => {
    it("marks multiple transactions as reviewed", async () => {
      const { transactionId: t1 } = insertTransaction(db, mockHouseholdId, accountId, { reviewed: false });
      const { transactionId: t2 } = insertTransaction(db, mockHouseholdId, accountId, { reviewed: false });

      const result = await bulkMarkReviewed([t1, t2], true, db);
      expect(result).toEqual({ success: true, updatedCount: 2 });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/integration/transaction-actions.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement server actions**

```typescript
// src/actions/transactions.ts
"use server";

import { eq, and, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db as defaultDb, type LedgrDb } from "@/db";
import { transactions } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";
import { getHouseholdId } from "@/lib/auth/session";
import { getTransactions, type TransactionFilters, type TransactionPage } from "@/queries/transactions";

const categoryIdSchema = z.string().min(1).nullable();
const transactionIdSchema = z.string().min(1);
const bulkIdsSchema = z.array(z.string().min(1)).min(1).max(500);

export async function updateTransactionCategory(
  transactionId: string,
  categoryId: string | null,
  db: LedgrDb = defaultDb,
): Promise<{ success: true } | { error: string }> {
  const householdId = await getHouseholdId();
  const parsedTxnId = transactionIdSchema.safeParse(transactionId);
  const parsedCatId = categoryIdSchema.safeParse(categoryId);
  if (!parsedTxnId.success || !parsedCatId.success) {
    return { error: "Invalid input" };
  }

  const scoped = scopedQuery(householdId, db);
  const existing = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(scoped.where(transactions, eq(transactions.id, transactionId), notDeleted(transactions)))
    .get();

  if (!existing) {
    return { error: "Transaction not found" };
  }

  const updates: Partial<typeof transactions.$inferInsert> = {
    categoryId: parsedCatId.data,
    updatedAt: new Date().toISOString(),
  };
  if (parsedCatId.data !== null) {
    updates.reviewed = true;
  }

  db.update(transactions)
    .set(updates)
    .where(eq(transactions.id, existing.id))
    .run();

  return { success: true };
}

export async function toggleReviewed(
  transactionId: string,
  db: LedgrDb = defaultDb,
): Promise<{ success: true; reviewed: boolean } | { error: string }> {
  const householdId = await getHouseholdId();

  const scoped = scopedQuery(householdId, db);
  const existing = db
    .select({ id: transactions.id, reviewed: transactions.reviewed })
    .from(transactions)
    .where(scoped.where(transactions, eq(transactions.id, transactionId), notDeleted(transactions)))
    .get();

  if (!existing) {
    return { error: "Transaction not found" };
  }

  const newReviewed = !existing.reviewed;
  db.update(transactions)
    .set({ reviewed: newReviewed, updatedAt: new Date().toISOString() })
    .where(eq(transactions.id, existing.id))
    .run();

  return { success: true, reviewed: newReviewed };
}

export async function bulkUpdateCategory(
  transactionIds: string[],
  categoryId: string | null,
  db: LedgrDb = defaultDb,
): Promise<{ success: true; updatedCount: number } | { error: string }> {
  const parsedIds = bulkIdsSchema.safeParse(transactionIds);
  if (!parsedIds.success) {
    return { error: "Invalid input: provide 1-500 transaction IDs" };
  }

  const householdId = await getHouseholdId();
  const scoped = scopedQuery(householdId, db);

  const owned = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      scoped.where(
        transactions,
        inArray(transactions.id, parsedIds.data),
        notDeleted(transactions),
      ),
    )
    .all();

  if (owned.length === 0) {
    return { success: true, updatedCount: 0 };
  }

  const ownedIds = owned.map((r) => r.id);
  const updates: Partial<typeof transactions.$inferInsert> = {
    categoryId,
    updatedAt: new Date().toISOString(),
  };
  if (categoryId !== null) {
    updates.reviewed = true;
  }

  db.update(transactions)
    .set(updates)
    .where(inArray(transactions.id, ownedIds))
    .run();

  revalidatePath("/transactions");
  return { success: true, updatedCount: ownedIds.length };
}

export async function bulkMarkReviewed(
  transactionIds: string[],
  reviewed: boolean,
  db: LedgrDb = defaultDb,
): Promise<{ success: true; updatedCount: number } | { error: string }> {
  const parsedIds = bulkIdsSchema.safeParse(transactionIds);
  if (!parsedIds.success) {
    return { error: "Invalid input: provide 1-500 transaction IDs" };
  }

  const householdId = await getHouseholdId();
  const scoped = scopedQuery(householdId, db);

  const owned = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      scoped.where(
        transactions,
        inArray(transactions.id, parsedIds.data),
        notDeleted(transactions),
      ),
    )
    .all();

  if (owned.length === 0) {
    return { success: true, updatedCount: 0 };
  }

  const ownedIds = owned.map((r) => r.id);
  db.update(transactions)
    .set({ reviewed, updatedAt: new Date().toISOString() })
    .where(inArray(transactions.id, ownedIds))
    .run();

  revalidatePath("/transactions");
  return { success: true, updatedCount: ownedIds.length };
}

export async function loadMoreTransactions(
  filters: TransactionFilters,
  cursor: string,
  db: LedgrDb = defaultDb,
): Promise<TransactionPage> {
  const householdId = await getHouseholdId();
  return getTransactions(householdId, filters, 50, cursor, db);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/integration/transaction-actions.test.ts`
Expected: All 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/actions/transactions.ts tests/integration/transaction-actions.test.ts
git commit -m "feat: add transaction server actions (category, reviewed, bulk ops)"
```

---

## Task 8: Sync Integration — Hook Categorization into Post-Sync

**Files:**
- Modify: `src/lib/categorization/engine.ts` (add DB-aware wrapper)
- Modify: `src/lib/plaid/sync.ts:608-614` (add categorization call)
- Create: `tests/integration/categorization-sync.test.ts`

- [ ] **Step 1: Write integration tests for categorization-in-sync**

```typescript
// tests/integration/categorization-sync.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertTransaction,
  insertMerchant,
  insertCategoryGroup,
  insertCategory,
  insertCategoryRule,
} from "./helpers";
import { categorizeSyncedTransactions } from "../../src/lib/categorization/engine";
import { transactions, merchants } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import type { LedgrDb } from "../../src/db";

describe("categorizeSyncedTransactions", () => {
  let db: LedgrDb;
  let close: () => void;
  let householdId: string;
  let accountId: string;
  let plaidItemId: string;

  beforeAll(() => {
    const testDb = createTestDb();
    db = testDb.db;
    close = testDb.close;

    ({ householdId } = insertHousehold(db));
    // Create a plaid item manually for scoping
    const { v4: uuid } = require("uuid");
    plaidItemId = uuid();
    db.insert(require("../../src/db/schema").plaidItems).values({
      id: plaidItemId,
      householdId,
      accessToken: "encrypted-token",
      status: "active",
    }).run();
    ({ accountId } = insertAccount(db, householdId, { plaidItemId }));
  });

  afterAll(() => close());

  it("applies matching rule to uncategorized transactions", () => {
    const { groupId } = insertCategoryGroup(db, householdId, { name: "Food" });
    const { categoryId } = insertCategory(db, householdId, groupId, { name: "Groceries" });
    insertCategoryRule(db, householdId, categoryId, { matchField: "name", matchPattern: "whole foods" });

    const { transactionId } = insertTransaction(db, householdId, accountId, { name: "Whole Foods Market" });

    categorizeSyncedTransactions(plaidItemId, householdId, db);

    const row = db.select().from(transactions).where(eq(transactions.id, transactionId)).get();
    expect(row!.categoryId).toBe(categoryId);
  });

  it("respects rule priority — higher wins", () => {
    const { groupId } = insertCategoryGroup(db, householdId, { name: "Drinks" });
    const { categoryId: catLow } = insertCategory(db, householdId, groupId, { name: "Dining" });
    const { categoryId: catHigh } = insertCategory(db, householdId, groupId, { name: "Coffee" });
    insertCategoryRule(db, householdId, catLow, { matchPattern: "starbucks", priority: 0 });
    insertCategoryRule(db, householdId, catHigh, { matchPattern: "starbucks", priority: 10 });

    const { transactionId } = insertTransaction(db, householdId, accountId, { name: "Starbucks #42" });

    categorizeSyncedTransactions(plaidItemId, householdId, db);

    const row = db.select().from(transactions).where(eq(transactions.id, transactionId)).get();
    expect(row!.categoryId).toBe(catHigh);
  });

  it("falls back to merchant default category", () => {
    const { groupId } = insertCategoryGroup(db, householdId, { name: "Subs" });
    const { categoryId } = insertCategory(db, householdId, groupId, { name: "Subscriptions" });
    const { merchantId } = insertMerchant(db, householdId, { name: "Netflix", categoryId });

    const { transactionId } = insertTransaction(db, householdId, accountId, {
      name: "NETFLIX.COM",
      merchantId,
    });

    categorizeSyncedTransactions(plaidItemId, householdId, db);

    const row = db.select().from(transactions).where(eq(transactions.id, transactionId)).get();
    expect(row!.categoryId).toBe(categoryId);
  });

  it("never overwrites an existing manual category assignment", () => {
    const { groupId } = insertCategoryGroup(db, householdId, { name: "Manual" });
    const { categoryId: manualCat } = insertCategory(db, householdId, groupId, { name: "Manual Cat" });
    const { categoryId: ruleCat } = insertCategory(db, householdId, groupId, { name: "Rule Cat" });
    insertCategoryRule(db, householdId, ruleCat, { matchPattern: "manual-test" });

    const { transactionId } = insertTransaction(db, householdId, accountId, {
      name: "manual-test store",
      categoryId: manualCat, // already categorized
    });

    categorizeSyncedTransactions(plaidItemId, householdId, db);

    const row = db.select().from(transactions).where(eq(transactions.id, transactionId)).get();
    expect(row!.categoryId).toBe(manualCat); // unchanged
  });

  it("categorization failure does not throw", () => {
    // Pass an invalid plaidItemId — no accounts found, no transactions, should not throw
    expect(() => {
      categorizeSyncedTransactions("nonexistent-item", householdId, db);
    }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/integration/categorization-sync.test.ts`
Expected: FAIL — `categorizeSyncedTransactions` not exported

- [ ] **Step 3: Add DB-aware wrapper to engine.ts**

```typescript
// src/lib/categorization/engine.ts — append to end of file
import { eq, and, isNull } from "drizzle-orm";
import type { LedgrDb } from "@/db";
import { transactions, merchants, categoryRules, accounts } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";

export function categorizeSyncedTransactions(
  plaidItemId: string,
  householdId: string,
  db: LedgrDb,
): void {
  const scoped = scopedQuery(householdId, db);

  // 1. Fetch rules ordered by priority DESC
  const rules = db
    .select({
      id: categoryRules.id,
      categoryId: categoryRules.categoryId,
      matchField: categoryRules.matchField,
      matchPattern: categoryRules.matchPattern,
      priority: categoryRules.priority,
    })
    .from(categoryRules)
    .where(scoped.where(categoryRules))
    .orderBy(categoryRules.priority)
    .all()
    .reverse() as CategoryRule[];

  // 2. Fetch uncategorized transactions for this plaidItem's accounts
  const itemAccounts = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.householdId, householdId),
        eq(accounts.plaidItemId, plaidItemId),
      ),
    )
    .all();

  if (itemAccounts.length === 0) return;

  const accountIds = itemAccounts.map((a) => a.id);
  const { inArray } = require("drizzle-orm");

  const uncategorized = db
    .select({
      id: transactions.id,
      name: transactions.name,
      merchantId: transactions.merchantId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        inArray(transactions.accountId, accountIds),
        isNull(transactions.categoryId),
        notDeleted(transactions),
      ),
    )
    .all();

  if (uncategorized.length === 0) return;

  // 3. Hydrate merchant data
  const categorizableTxns: CategorizableTransaction[] = uncategorized.map((txn) => {
    let merchantName: string | null = null;
    let merchantCategoryId: string | null = null;

    if (txn.merchantId) {
      const merchant = db
        .select({ name: merchants.name, categoryId: merchants.categoryId })
        .from(merchants)
        .where(eq(merchants.id, txn.merchantId))
        .get();
      if (merchant) {
        merchantName = merchant.name;
        merchantCategoryId = merchant.categoryId;
      }
    }

    return {
      id: txn.id,
      name: txn.name,
      merchantId: txn.merchantId,
      merchantName,
      merchantCategoryId,
    };
  });

  // 4. Run pure categorization
  const assignments = categorizeTransactions(categorizableTxns, rules);
  if (assignments.length === 0) return;

  // 5. Apply assignments
  const now = new Date().toISOString();
  db.transaction((tx) => {
    for (const assignment of assignments) {
      tx.update(transactions)
        .set({ categoryId: assignment.categoryId, updatedAt: now })
        .where(eq(transactions.id, assignment.transactionId))
        .run();
    }
  });
}
```

- [ ] **Step 4: Fix the import — use static import for inArray**

Update the import at the top of the appended code to use a static import. The file should have this import block at the top:

```typescript
// src/lib/categorization/engine.ts — imports at top of file
// (Add these alongside the existing pure-function exports)
import { eq, and, isNull, inArray } from "drizzle-orm";
import type { LedgrDb } from "@/db";
import { transactions, merchants, categoryRules, accounts } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";
```

Remove the `require("drizzle-orm")` line from inside the function.

- [ ] **Step 5: Hook into doSync**

```typescript
// src/lib/plaid/sync.ts — after the applyToDb call (around line 614), add:
import { categorizeSyncedTransactions } from "@/lib/categorization/engine";

// ... inside doSync, after the counts = await applyToDb(...) block:
    // Auto-categorize newly synced transactions (non-fatal)
    try {
      categorizeSyncedTransactions(itemId, householdId, db);
    } catch (catError) {
      console.error(`Categorization failed for item ${itemId}:`, catError);
    }
```

- [ ] **Step 6: Run all categorization + sync tests**

Run: `pnpm vitest run tests/integration/categorization-sync.test.ts src/lib/categorization/engine.test.ts tests/integration/transaction-sync.test.ts`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/lib/categorization/engine.ts src/lib/plaid/sync.ts tests/integration/categorization-sync.test.ts
git commit -m "feat: hook categorization engine into post-sync pipeline"
```

---

## Task 9: Amount Display Atom

**Files:**
- Create: `src/components/atoms/amount-display.tsx`

- [ ] **Step 1: Create amount-display atom**

```tsx
// src/components/atoms/amount-display.tsx
import { centsToDisplay } from "@/lib/money";
import { cn } from "@/lib/utils";

interface AmountDisplayProps {
  amount: number;
  currency?: string;
  pending?: boolean;
  className?: string;
}

export function AmountDisplay({
  amount,
  currency = "USD",
  pending = false,
  className,
}: AmountDisplayProps) {
  const isIncome = amount < 0;
  const formatted = centsToDisplay(Math.abs(amount), currency);
  const prefix = isIncome ? "+" : "-";

  return (
    <span
      className={cn(
        "tabular-nums text-sm font-medium",
        isIncome && "text-emerald-600",
        pending && "opacity-60",
        className,
      )}
    >
      {prefix}
      {formatted}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/atoms/amount-display.tsx
git commit -m "feat: add AmountDisplay atom with income/expense coloring"
```

---

## Task 10: Category Picker + Reviewed Checkbox Molecules

**Files:**
- Create: `src/components/molecules/category-picker.tsx`
- Create: `src/components/molecules/reviewed-checkbox.tsx`

- [ ] **Step 1: Create category-picker molecule**

```tsx
// src/components/molecules/category-picker.tsx
"use client";

import { useState, useTransition } from "react";
import { updateTransactionCategory } from "@/actions/transactions";
import type { CategoryGroup } from "@/queries/categories";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectLabel,
} from "@/components/ui/select";

interface CategoryPickerProps {
  transactionId: string;
  currentCategoryId: string | null;
  currentCategoryName: string | null;
  categories: CategoryGroup[];
  disabled?: boolean;
}

export function CategoryPicker({
  transactionId,
  currentCategoryId,
  currentCategoryName,
  categories,
  disabled = false,
}: CategoryPickerProps) {
  const [value, setValue] = useState(currentCategoryId ?? "uncategorized");
  const [isPending, startTransition] = useTransition();

  function handleChange(newValue: string) {
    const prevValue = value;
    const categoryId = newValue === "uncategorized" ? null : newValue;
    setValue(newValue);

    startTransition(async () => {
      const result = await updateTransactionCategory(transactionId, categoryId);
      if ("error" in result) {
        setValue(prevValue);
      }
    });
  }

  return (
    <Select value={value} onValueChange={handleChange} disabled={disabled || isPending}>
      <SelectTrigger className="h-7 w-[140px] text-xs px-2">
        <SelectValue>
          {value === "uncategorized" ? (
            <span className="text-muted-foreground italic">Uncategorized</span>
          ) : (
            currentCategoryName ?? "Select..."
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="uncategorized">
          <span className="italic text-muted-foreground">Uncategorized</span>
        </SelectItem>
        {categories.map((group) => (
          <div key={group.id}>
            <SelectLabel className="text-xs font-semibold text-muted-foreground px-2 py-1">
              {group.name}
            </SelectLabel>
            {group.categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.icon ? `${cat.icon} ` : ""}{cat.name}
              </SelectItem>
            ))}
          </div>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: Create reviewed-checkbox molecule**

```tsx
// src/components/molecules/reviewed-checkbox.tsx
"use client";

import { useState, useTransition } from "react";
import { toggleReviewed } from "@/actions/transactions";
import { cn } from "@/lib/utils";

interface ReviewedCheckboxProps {
  transactionId: string;
  reviewed: boolean;
}

export function ReviewedCheckbox({ transactionId, reviewed }: ReviewedCheckboxProps) {
  const [isReviewed, setIsReviewed] = useState(reviewed);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const prev = isReviewed;
    setIsReviewed(!prev);

    startTransition(async () => {
      const result = await toggleReviewed(transactionId);
      if ("error" in result) {
        setIsReviewed(prev);
      }
    });
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={cn(
        "text-sm transition-colors",
        isReviewed ? "text-primary" : "text-muted-foreground/40",
        isPending && "opacity-50",
      )}
      title={isReviewed ? "Reviewed" : "Not reviewed"}
    >
      {isReviewed ? "●" : "○"}
    </button>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/molecules/category-picker.tsx src/components/molecules/reviewed-checkbox.tsx
git commit -m "feat: add CategoryPicker and ReviewedCheckbox molecules with optimistic updates"
```

---

## Task 11: Transaction Row + Empty State + Bulk Action Bar

**Files:**
- Create: `src/components/molecules/transaction-row.tsx`
- Create: `src/components/molecules/transaction-empty-state.tsx`
- Create: `src/components/molecules/bulk-action-bar.tsx`

- [ ] **Step 1: Create transaction-row molecule**

```tsx
// src/components/molecules/transaction-row.tsx
"use client";

import { AmountDisplay } from "@/components/atoms/amount-display";
import { CategoryPicker } from "@/components/molecules/category-picker";
import { ReviewedCheckbox } from "@/components/molecules/reviewed-checkbox";
import type { TransactionRow as TxnRow } from "@/queries/transactions";
import type { CategoryGroup } from "@/queries/categories";
import { cn } from "@/lib/utils";

interface TransactionRowProps {
  transaction: TxnRow;
  categories: CategoryGroup[];
  isSelected: boolean;
  onSelect: (id: string, checked: boolean) => void;
}

export function TransactionRow({
  transaction: txn,
  categories,
  isSelected,
  onSelect,
}: TransactionRowProps) {
  return (
    <div
      className={cn(
        "group/row grid grid-cols-[32px_90px_1fr_140px_160px_100px_40px] items-center h-10 px-2 border-b text-sm hover:bg-muted/50 transition-colors",
        !txn.reviewed && "border-l-2 border-l-primary/40",
        txn.pending && "opacity-60",
      )}
    >
      {/* Checkbox */}
      <div className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelect(txn.id, e.target.checked)}
          className="h-3.5 w-3.5 rounded border-muted-foreground/30"
        />
      </div>

      {/* Date */}
      <span className="text-muted-foreground text-xs">
        {new Date(txn.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </span>

      {/* Name */}
      <div className="truncate pr-2">
        <span className="font-medium">{txn.name}</span>
        {txn.originalName !== txn.name && (
          <span className="text-xs text-muted-foreground ml-1 hidden group-hover/row:inline">
            ({txn.originalName})
          </span>
        )}
      </div>

      {/* Account */}
      <span className="text-muted-foreground text-xs truncate">{txn.accountName}</span>

      {/* Category */}
      <CategoryPicker
        transactionId={txn.id}
        currentCategoryId={txn.categoryId}
        currentCategoryName={txn.categoryName}
        categories={categories}
        disabled={txn.hasSplits}
      />

      {/* Amount */}
      <div className="text-right">
        <AmountDisplay amount={txn.normalizedAmount} currency={txn.currency} pending={txn.pending} />
      </div>

      {/* Reviewed */}
      <div className="flex items-center justify-center">
        <ReviewedCheckbox transactionId={txn.id} reviewed={txn.reviewed} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create transaction-empty-state molecule**

```tsx
// src/components/molecules/transaction-empty-state.tsx
import { ListX, ArrowRight } from "lucide-react";
import Link from "next/link";

interface TransactionEmptyStateProps {
  hasFilters: boolean;
}

export function TransactionEmptyState({ hasFilters }: TransactionEmptyStateProps) {
  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ListX className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <h3 className="text-lg font-medium">No transactions match your filters</h3>
        <p className="text-sm text-muted-foreground mt-1">Try adjusting or clearing your filters.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <ListX className="h-10 w-10 text-muted-foreground/40 mb-3" />
      <h3 className="text-lg font-medium">No transactions yet</h3>
      <p className="text-sm text-muted-foreground mt-1">
        Connect a bank account and sync to see your transactions.
      </p>
      <Link
        href="/accounts"
        className="inline-flex items-center gap-1 text-sm text-primary mt-3 hover:underline"
      >
        Go to Accounts <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Create bulk-action-bar molecule**

```tsx
// src/components/molecules/bulk-action-bar.tsx
"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { bulkUpdateCategory, bulkMarkReviewed } from "@/actions/transactions";
import type { CategoryGroup } from "@/queries/categories";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectLabel,
} from "@/components/ui/select";

interface BulkActionBarProps {
  selectedIds: string[];
  categories: CategoryGroup[];
  onComplete: () => void;
}

export function BulkActionBar({ selectedIds, categories, onComplete }: BulkActionBarProps) {
  const [isPending, startTransition] = useTransition();

  function handleCategorize(categoryId: string) {
    const resolvedId = categoryId === "uncategorized" ? null : categoryId;
    startTransition(async () => {
      await bulkUpdateCategory(selectedIds, resolvedId);
      onComplete();
    });
  }

  function handleMarkReviewed() {
    startTransition(async () => {
      await bulkMarkReviewed(selectedIds, true);
      onComplete();
    });
  }

  return (
    <div className="sticky top-14 z-10 flex items-center gap-3 bg-muted/80 backdrop-blur-sm border rounded-md px-3 py-2 mb-2">
      <span className="text-sm font-medium">{selectedIds.length} selected</span>

      <Select onValueChange={handleCategorize} disabled={isPending}>
        <SelectTrigger className="h-7 w-[160px] text-xs">
          <SelectValue placeholder="Set category..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="uncategorized">
            <span className="italic text-muted-foreground">Uncategorized</span>
          </SelectItem>
          {categories.map((group) => (
            <div key={group.id}>
              <SelectLabel className="text-xs font-semibold text-muted-foreground px-2 py-1">
                {group.name}
              </SelectLabel>
              {group.categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.icon ? `${cat.icon} ` : ""}{cat.name}
                </SelectItem>
              ))}
            </div>
          ))}
        </SelectContent>
      </Select>

      <Button variant="outline" size="xs" onClick={handleMarkReviewed} disabled={isPending}>
        Mark Reviewed
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/molecules/transaction-row.tsx src/components/molecules/transaction-empty-state.tsx src/components/molecules/bulk-action-bar.tsx
git commit -m "feat: add TransactionRow, TransactionEmptyState, and BulkActionBar molecules"
```

---

## Task 12: Transaction Filters Molecule

**Files:**
- Create: `src/components/molecules/transaction-filters.tsx`

- [ ] **Step 1: Create transaction-filters molecule**

```tsx
// src/components/molecules/transaction-filters.tsx
"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectLabel,
} from "@/components/ui/select";
import type { CategoryGroup } from "@/queries/categories";

interface AccountOption {
  id: string;
  name: string;
}

interface TransactionFiltersProps {
  accounts: AccountOption[];
  categories: CategoryGroup[];
}

export function TransactionFilters({ accounts, categories }: TransactionFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchValue, setSearchValue] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const updateFilter = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null || value === "" || value === "all") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  function handleSearchChange(value: string) {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateFilter("q", value || null);
    }, 300);
  }

  function clearFilters() {
    setSearchValue("");
    router.push(pathname);
  }

  const hasFilters =
    searchParams.has("q") ||
    searchParams.has("account") ||
    searchParams.has("category") ||
    searchParams.has("from") ||
    searchParams.has("to") ||
    searchParams.has("reviewed");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search..."
          value={searchValue}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="h-8 w-[180px] pl-7 text-sm"
        />
      </div>

      {/* Account filter */}
      <Select
        value={searchParams.get("account") ?? "all"}
        onValueChange={(v) => updateFilter("account", v === "all" ? null : v)}
      >
        <SelectTrigger className="h-8 w-[160px] text-xs">
          <SelectValue placeholder="All accounts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All accounts</SelectItem>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Category filter */}
      <Select
        value={searchParams.get("category") ?? "all"}
        onValueChange={(v) => updateFilter("category", v === "all" ? null : v)}
      >
        <SelectTrigger className="h-8 w-[160px] text-xs">
          <SelectValue placeholder="All categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          <SelectItem value="uncategorized">
            <span className="italic">Uncategorized</span>
          </SelectItem>
          {categories.map((group) => (
            <div key={group.id}>
              <SelectLabel className="text-xs font-semibold text-muted-foreground px-2 py-1">
                {group.name}
              </SelectLabel>
              {group.categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
              ))}
            </div>
          ))}
        </SelectContent>
      </Select>

      {/* Date range */}
      <Input
        type="date"
        value={searchParams.get("from") ?? ""}
        onChange={(e) => updateFilter("from", e.target.value || null)}
        className="h-8 w-[130px] text-xs"
      />
      <span className="text-xs text-muted-foreground">to</span>
      <Input
        type="date"
        value={searchParams.get("to") ?? ""}
        onChange={(e) => updateFilter("to", e.target.value || null)}
        className="h-8 w-[130px] text-xs"
      />

      {/* Reviewed switch */}
      <div className="flex items-center gap-1.5">
        <Switch
          id="reviewed-filter"
          checked={searchParams.get("reviewed") === "true"}
          onCheckedChange={(checked) =>
            updateFilter("reviewed", checked ? "true" : null)
          }
          className="h-4 w-7"
        />
        <Label htmlFor="reviewed-filter" className="text-xs">Reviewed</Label>
      </div>

      {/* Clear */}
      {hasFilters && (
        <Button variant="ghost" size="xs" onClick={clearFilters} className="h-8 text-xs">
          <X className="h-3 w-3 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/molecules/transaction-filters.tsx
git commit -m "feat: add TransactionFilters molecule with URL-driven searchParams"
```

---

## Task 13: Transaction List Organism

**Files:**
- Create: `src/components/organisms/transaction-list.tsx`

- [ ] **Step 1: Create transaction-list organism**

```tsx
// src/components/organisms/transaction-list.tsx
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TransactionRow } from "@/components/molecules/transaction-row";
import { BulkActionBar } from "@/components/molecules/bulk-action-bar";
import { loadMoreTransactions } from "@/actions/transactions";
import type { TransactionRow as TxnRow, TransactionFilters } from "@/queries/transactions";
import type { CategoryGroup } from "@/queries/categories";

interface TransactionListProps {
  initialRows: TxnRow[];
  nextCursor: string | null;
  categories: CategoryGroup[];
  filters: TransactionFilters;
}

export function TransactionList({
  initialRows,
  nextCursor,
  categories,
  filters,
}: TransactionListProps) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(nextCursor);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);

  const handleSelect = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.id)));
    }
  }, [rows, selected.size]);

  async function handleLoadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await loadMoreTransactions(filters, cursor);
      setRows((prev) => [...prev, ...page.rows]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  function handleBulkComplete() {
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div>
      {selected.size > 0 && (
        <BulkActionBar
          selectedIds={Array.from(selected)}
          categories={categories}
          onComplete={handleBulkComplete}
        />
      )}

      {/* Header row */}
      <div className="grid grid-cols-[32px_90px_1fr_140px_160px_100px_40px] items-center h-8 px-2 border-b text-xs font-medium text-muted-foreground">
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            checked={selected.size > 0 && selected.size === rows.length}
            onChange={handleSelectAll}
            className="h-3.5 w-3.5 rounded border-muted-foreground/30"
          />
        </div>
        <span>Date</span>
        <span>Description</span>
        <span>Account</span>
        <span>Category</span>
        <span className="text-right">Amount</span>
        <span className="text-center">Rev</span>
      </div>

      {/* Transaction rows */}
      {rows.map((txn) => (
        <TransactionRow
          key={txn.id}
          transaction={txn}
          categories={categories}
          isSelected={selected.has(txn.id)}
          onSelect={handleSelect}
        />
      ))}

      {/* Load more */}
      {cursor && (
        <div className="flex justify-center py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading..." : "Load More"}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/organisms/transaction-list.tsx
git commit -m "feat: add TransactionList organism with pagination, selection, and bulk actions"
```

---

## Task 14: Transactions Page + Loading + Error + Sidebar

**Files:**
- Create: `src/app/(dashboard)/transactions/page.tsx`
- Create: `src/app/(dashboard)/transactions/loading.tsx`
- Create: `src/app/(dashboard)/transactions/error.tsx`
- Modify: `src/components/organisms/sidebar-nav.tsx:16-19`

- [ ] **Step 1: Create transactions page (server component)**

```tsx
// src/app/(dashboard)/transactions/page.tsx
import { getHouseholdId } from "@/lib/auth/session";
import { getTransactions, type TransactionFilters } from "@/queries/transactions";
import { getCategories } from "@/queries/categories";
import { getAccounts } from "@/queries/accounts";
import { TransactionFilters as FilterBar } from "@/components/molecules/transaction-filters";
import { TransactionList } from "@/components/organisms/transaction-list";
import { TransactionEmptyState } from "@/components/molecules/transaction-empty-state";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const householdId = await getHouseholdId();
  const params = await searchParams;

  const filters: TransactionFilters = {
    accountId: typeof params.account === "string" ? params.account : undefined,
    categoryId:
      params.category === "uncategorized"
        ? null
        : typeof params.category === "string"
          ? params.category
          : undefined,
    dateFrom: typeof params.from === "string" ? params.from : undefined,
    dateTo: typeof params.to === "string" ? params.to : undefined,
    search: typeof params.q === "string" ? params.q : undefined,
    reviewed: params.reviewed === "true" ? true : undefined,
  };

  const [page, allCategories, allAccounts] = await Promise.all([
    Promise.resolve(getTransactions(householdId, filters)),
    Promise.resolve(getCategories(householdId)),
    Promise.resolve(getAccounts(householdId)),
  ]);

  const hasFilters = Object.values(filters).some((v) => v !== undefined);
  const accountOptions = allAccounts.map((a) => ({ id: a.id, name: a.name }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>

      <FilterBar accounts={accountOptions} categories={allCategories} />

      {page.rows.length === 0 ? (
        <TransactionEmptyState hasFilters={hasFilters} />
      ) : (
        <TransactionList
          key={JSON.stringify(filters)}
          initialRows={page.rows}
          nextCursor={page.nextCursor}
          categories={allCategories}
          filters={filters}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create loading skeleton**

```tsx
// src/app/(dashboard)/transactions/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function TransactionsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      {/* Filter bar skeleton */}
      <div className="flex gap-2">
        <Skeleton className="h-8 w-[180px]" />
        <Skeleton className="h-8 w-[160px]" />
        <Skeleton className="h-8 w-[160px]" />
        <Skeleton className="h-8 w-[130px]" />
        <Skeleton className="h-8 w-[130px]" />
      </div>
      {/* Header row skeleton */}
      <Skeleton className="h-8 w-full" />
      {/* Transaction row skeletons */}
      {Array.from({ length: 10 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create error boundary**

```tsx
// src/app/(dashboard)/transactions/error.tsx
"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TransactionsError({
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
        {error.message || "Failed to load transactions."}
      </p>
      <Button variant="outline" size="sm" onClick={reset} className="mt-4">
        Try Again
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Add Transactions link to sidebar nav**

```typescript
// src/components/organisms/sidebar-nav.tsx — update imports and NAV_ITEMS
// Add ArrowLeftRight to the lucide-react import:
import { LayoutDashboard, Building2, ArrowLeftRight, LogOut } from "lucide-react";

// Update NAV_ITEMS:
const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Building2 },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
];
```

- [ ] **Step 5: Run full test suite**

Run: `pnpm vitest run`
Expected: All tests pass (existing + new)

- [ ] **Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: No type errors

- [ ] **Step 7: Start dev server and test in browser**

Run: `pnpm dev`

Test manually:
1. Navigate to `/transactions` — should show empty state or transaction list
2. Test filters — account, category, date range, search, reviewed toggle
3. Test "Clear" button clears all filters
4. Test category picker — change category on a row, verify optimistic update
5. Test reviewed toggle — click dot, verify it toggles
6. Test "Load More" if enough transactions
7. Test bulk selection — select multiple, verify bulk action bar appears
8. Test bulk categorize and bulk mark reviewed

- [ ] **Step 8: Commit**

```bash
git add src/app/\(dashboard\)/transactions/ src/components/organisms/sidebar-nav.tsx
git commit -m "feat: add transactions page with filters, pagination, and bulk actions"
```

---

## Task 15: Run Full CI Pipeline

- [ ] **Step 1: Run the full CI pipeline in order**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

Expected: All three pass. Fix any issues before proceeding.

- [ ] **Step 2: Final commit if any lint/type fixes were needed**

```bash
git add -A
git commit -m "fix: resolve lint/type issues from Phase 4 implementation"
```

---

## Task 16: Update BUILD_ORDER.md

**Files:**
- Modify: `docs/BUILD_ORDER.md`

- [ ] **Step 1: Mark Phase 4 as complete in BUILD_ORDER.md**

Update the Phase 4 section status from `Not started` to `Complete` and add implementation notes similar to Phases 1-3. Add deliverables list with all files created.

- [ ] **Step 2: Commit**

```bash
git add docs/BUILD_ORDER.md
git commit -m "docs: mark Phase 4 as complete in BUILD_ORDER.md"
```
