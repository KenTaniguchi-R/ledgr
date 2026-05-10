# Transaction Detail Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a push-layout detail panel that opens when clicking a transaction row, showing editable fields and split transaction management.

**Architecture:** CSS grid push layout inside `TransactionList` (3fr/2fr split). URL state (`?txn=<id>`) via dedicated hook. Hybrid data loading: instant render from list row data, async fetch for splits + metadata. Consolidated `updateTransactionFields` server action with Zod validation. Split CRUD wrapped in `db.transaction()` for atomicity.

**Tech Stack:** Next.js 16 App Router, TypeScript, shadcn/ui v4, Tailwind v4, Drizzle ORM, SQLite, Vitest, fast-check

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/hooks/use-selected-transaction.ts` | URL `?txn=<id>` param management |
| Create | `src/components/atoms/currency-input.tsx` | Controlled cents↔display input |
| Create | `src/components/molecules/editable-text.tsx` | Text-on-render, input-on-click, blur-to-save |
| Create | `src/components/molecules/transaction-split-row.tsx` | Single split: category + amount + notes + delete |
| Create | `src/components/molecules/transaction-metadata.tsx` | Collapsible read-only metadata section |
| Create | `src/components/organisms/transaction-detail-panel.tsx` | Main panel orchestrating all sections |
| Create | `src/actions/transaction-detail.ts` | Server actions: fetch detail, update fields, split CRUD |
| Modify | `src/queries/transactions.ts` | Add `TransactionDetail` type + `getTransactionDetail` query |
| Modify | `src/actions/transactions.ts` | Bug fixes: revalidatePath, reviewed-on-null logic |
| Modify | `src/components/molecules/transaction-row.tsx` | onClick, isActive, keyboard access, React.memo |
| Modify | `src/components/organisms/transaction-list.tsx` | Push layout grid, selected state, bulk interaction |
| Create | `tests/integration/transaction-detail.test.ts` | Integration tests for queries + actions |
| Create | `src/components/atoms/currency-input.test.ts` | Unit test for cents↔display conversion |

---

### Task 1: Bug Fixes in Existing Actions

**Files:**
- Modify: `src/actions/transactions.ts`

- [ ] **Step 1: Add revalidatePath to updateTransactionCategory**

```ts
// In src/actions/transactions.ts, after line 53 (db.update...run()):
// Add before the return:
import { revalidatePath } from "next/cache"; // already imported at line 4

// After the db.update().run() call, before return { success: true }:
revalidatePath("/transactions");
```

The full change: find `return { success: true };` at the end of `updateTransactionCategory` (line 55) and add `revalidatePath("/transactions");` before it.

- [ ] **Step 2: Add revalidatePath to toggleReviewed**

Same pattern: add `revalidatePath("/transactions");` before `return { success: true, reviewed: newReviewed };` at line 81.

- [ ] **Step 3: Set reviewed=false when category cleared to null**

In `updateTransactionCategory`, the current code only sets `reviewed = true` when `categoryId !== null` (line 46-48). Add the else branch:

```ts
  if (parsedCatId.data !== null) {
    updates.reviewed = true;
  } else {
    updates.reviewed = false;
  }
```

- [ ] **Step 4: Add missing fields to transactionSelectFields**

In `src/queries/transactions.ts`, add to `transactionSelectFields` (after line 65, before the closing `}`):

```ts
  isTransfer: transactions.isTransfer,
  transferPairId: transactions.transferPairId,
  categorySource: transactions.categorySource,
  plaidTransactionId: transactions.plaidTransactionId,
```

Update the `TransactionRow` interface (after line 37, before closing `}`):

```ts
  isTransfer: boolean;
  transferPairId: string | null;
  categorySource: string | null;
  plaidTransactionId: string | null;
```

Update the `result` mapping in `getTransactions` (inside the `.map()` at line 167) to include:

```ts
  isTransfer: Boolean(row.isTransfer),
  transferPairId: row.transferPairId ?? null,
  categorySource: row.categorySource ?? null,
  plaidTransactionId: row.plaidTransactionId ?? null,
```

- [ ] **Step 5: Run tests to verify nothing broke**

Run: `pnpm test -- --run`
Expected: All existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/actions/transactions.ts src/queries/transactions.ts
git commit -m "fix(transactions): add revalidatePath, reviewed-on-null, missing select fields"
```

---

### Task 2: useSelectedTransaction Hook

**Files:**
- Create: `src/hooks/use-selected-transaction.ts`

- [ ] **Step 1: Create the hook**

```ts
"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export function useSelectedTransaction() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("txn");

  const select = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("txn", id);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const clear = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("txn");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname, searchParams]);

  return { selectedId, select, clear };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-selected-transaction.ts
git commit -m "feat: add useSelectedTransaction hook for URL ?txn= state"
```

---

### Task 3: TransactionDetail Query + fetchTransactionDetail Action

**Files:**
- Modify: `src/queries/transactions.ts`
- Create: `src/actions/transaction-detail.ts`

- [ ] **Step 1: Write the failing integration test for getTransactionDetail**

Create `tests/integration/transaction-detail.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { v4 as uuid } from "uuid";
import { createTestDb } from "./setup";
import { getTransactionDetail } from "@/queries/transactions";
import type { LedgrDb } from "@/db";
import {
  households,
  accounts,
  transactions,
  transactionSplits,
  categoryGroups,
  categories,
} from "@/db/schema";

let db: LedgrDb;
let close: () => void;

const householdId = uuid();
const accountId = uuid();
const categoryGroupId = uuid();
const catGroceries = uuid();
const catDining = uuid();
const txnId = uuid();
const splitId1 = uuid();
const splitId2 = uuid();

beforeAll(() => {
  ({ db, close } = createTestDb());

  db.insert(households).values({ id: householdId, name: "Test" }).run();
  db.insert(accounts)
    .values({
      id: accountId,
      householdId,
      name: "Checking",
      type: "depository",
      subtype: "checking",
    })
    .run();
  db.insert(categoryGroups)
    .values({ id: categoryGroupId, householdId, name: "Food", sortOrder: 1 })
    .run();
  db.insert(categories)
    .values([
      { id: catGroceries, groupId: categoryGroupId, name: "Groceries", sortOrder: 1 },
      { id: catDining, groupId: categoryGroupId, name: "Dining", sortOrder: 2 },
    ])
    .run();
  db.insert(transactions)
    .values({
      id: txnId,
      accountId,
      householdId,
      date: "2026-05-10",
      originalName: "WHOLE FOODS #123",
      name: "Whole Foods",
      amount: 5000,
      normalizedAmount: -5000,
      categoryId: catGroceries,
      categorySource: "manual",
      isTransfer: false,
    })
    .run();
  db.insert(transactionSplits)
    .values([
      { id: splitId1, transactionId: txnId, categoryId: catGroceries, amount: 3000 },
      { id: splitId2, transactionId: txnId, categoryId: catDining, amount: 2000 },
    ])
    .run();
});

afterAll(() => close());

describe("getTransactionDetail", () => {
  it("returns transaction with splits and category names", () => {
    const detail = getTransactionDetail(householdId, txnId, db);

    expect(detail).not.toBeNull();
    expect(detail!.id).toBe(txnId);
    expect(detail!.name).toBe("Whole Foods");
    expect(detail!.categorySource).toBe("manual");
    expect(detail!.isTransfer).toBe(false);
    expect(detail!.plaidTransactionId).toBeNull();
    expect(detail!.splits).toHaveLength(2);
    expect(detail!.splits[0].categoryName).toBe("Groceries");
    expect(detail!.splits[0].amount).toBe(3000);
    expect(detail!.splits[1].categoryName).toBe("Dining");
    expect(detail!.splits[1].amount).toBe(2000);
  });

  it("returns null for transaction in different household", () => {
    const detail = getTransactionDetail("other-household", txnId, db);
    expect(detail).toBeNull();
  });

  it("returns null for soft-deleted transaction", () => {
    const deletedId = uuid();
    db.insert(transactions)
      .values({
        id: deletedId,
        accountId,
        householdId,
        date: "2026-05-10",
        originalName: "DELETED",
        name: "Deleted",
        amount: 1000,
        normalizedAmount: -1000,
        deletedAt: new Date().toISOString(),
      })
      .run();

    const detail = getTransactionDetail(householdId, deletedId, db);
    expect(detail).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run tests/integration/transaction-detail.test.ts`
Expected: FAIL — `getTransactionDetail` is not exported.

- [ ] **Step 3: Implement getTransactionDetail**

Add to `src/queries/transactions.ts` after the `getTransactions` function:

```ts
export interface SplitRow {
  id: string;
  categoryId: string;
  categoryName: string | null;
  categoryIcon: string | null;
  amount: number;
  notes: string | null;
}

export interface TransactionDetail extends TransactionRow {
  splits: SplitRow[];
}

export function getTransactionDetail(
  householdId: string,
  transactionId: string,
  db: LedgrDb = defaultDb,
): TransactionDetail | null {
  const base = baseTransactionQuery(db, householdId);
  const row = base
    .joins(db.select(base.select).from(base.from))
    .where(
      base.scoped.where(
        transactions,
        eq(transactions.id, transactionId),
        isNull(transactions.deletedAt),
      ),
    )
    .get();

  if (!row) return null;

  const splits = db
    .select({
      id: transactionSplits.id,
      categoryId: transactionSplits.categoryId,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      amount: transactionSplits.amount,
      notes: transactionSplits.notes,
    })
    .from(transactionSplits)
    .leftJoin(categories, eq(transactionSplits.categoryId, categories.id))
    .where(eq(transactionSplits.transactionId, transactionId))
    .all();

  return {
    ...row,
    accountName: row.accountName ?? "",
    currency: row.currency ?? "USD",
    pending: Boolean(row.pending),
    reviewed: Boolean(row.reviewed),
    isTransfer: Boolean(row.isTransfer),
    transferPairId: row.transferPairId ?? null,
    categorySource: row.categorySource ?? null,
    plaidTransactionId: row.plaidTransactionId ?? null,
    hasSplits: splits.length > 0,
    splits,
  };
}
```

Note: `transactionSelectFields` already includes `isTransfer`, `transferPairId`, `categorySource`, `plaidTransactionId` from Task 1.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --run tests/integration/transaction-detail.test.ts`
Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/queries/transactions.ts tests/integration/transaction-detail.test.ts
git commit -m "feat: add getTransactionDetail query with splits join"
```

---

### Task 4: Server Actions — updateTransactionFields

**Files:**
- Create: `src/actions/transaction-detail.ts`
- Modify: `tests/integration/transaction-detail.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/integration/transaction-detail.test.ts`:

```ts
import { updateTransactionFields } from "@/actions/transaction-detail";

// Add after the getTransactionDetail describe block:

describe("updateTransactionFields", () => {
  it("updates name and notes with partial data", async () => {
    const result = await updateTransactionFields(
      txnId,
      { name: "Whole Foods Market", notes: "Weekly groceries" },
      db,
    );

    expect(result).toEqual({ success: true });

    const detail = getTransactionDetail(householdId, txnId, db);
    expect(detail!.name).toBe("Whole Foods Market");
    expect(detail!.notes).toBe("Weekly groceries");
  });

  it("rejects invalid date format", async () => {
    const result = await updateTransactionFields(
      txnId,
      { date: "not-a-date" },
      db,
    );

    expect(result).toEqual({ error: "Invalid input" });
  });

  it("rejects name exceeding 255 chars", async () => {
    const result = await updateTransactionFields(
      txnId,
      { name: "x".repeat(256) },
      db,
    );

    expect(result).toEqual({ error: "Invalid input" });
  });

  it("blocks date edit on Plaid-synced transactions", async () => {
    const plaidTxnId = uuid();
    db.insert(transactions)
      .values({
        id: plaidTxnId,
        accountId,
        householdId,
        date: "2026-05-10",
        originalName: "PLAID TXN",
        name: "Plaid Txn",
        amount: 1000,
        normalizedAmount: -1000,
        plaidTransactionId: "plaid_123",
      })
      .run();

    const result = await updateTransactionFields(
      plaidTxnId,
      { date: "2026-05-11" },
      db,
    );

    expect(result).toEqual({ error: "Cannot edit date on bank-synced transactions" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run tests/integration/transaction-detail.test.ts`
Expected: FAIL — `updateTransactionFields` not found.

- [ ] **Step 3: Implement the action**

Create `src/actions/transaction-detail.ts`:

```ts
"use server";

import { eq, sql, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { db as defaultDb, type LedgrDb } from "@/db";
import { transactions, transactionSplits, categories } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";
import { nowISO } from "@/lib/date-utils";
import { getHouseholdId } from "@/lib/auth/session";
import { getTransactionDetail, type TransactionDetail } from "@/queries/transactions";

const transactionIdSchema = z.string().min(1);

const updateFieldsSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    notes: z.string().max(2000).optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
      .optional(),
    isTransfer: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field required",
  });

export async function fetchTransactionDetail(
  transactionId: string,
  db: LedgrDb = defaultDb,
): Promise<{ data: TransactionDetail } | { error: string }> {
  const householdId = await getHouseholdId();
  const parsed = transactionIdSchema.safeParse(transactionId);
  if (!parsed.success) return { error: "Invalid input" };

  const detail = getTransactionDetail(householdId, parsed.data, db);
  if (!detail) return { error: "deleted" };

  return { data: detail };
}

export async function updateTransactionFields(
  transactionId: string,
  data: z.input<typeof updateFieldsSchema>,
  db: LedgrDb = defaultDb,
): Promise<{ success: true } | { error: string }> {
  const householdId = await getHouseholdId();
  const parsedId = transactionIdSchema.safeParse(transactionId);
  const parsedData = updateFieldsSchema.safeParse(data);
  if (!parsedId.success || !parsedData.success) return { error: "Invalid input" };

  const scoped = scopedQuery(householdId, db);
  const existing = db
    .select({
      id: transactions.id,
      plaidTransactionId: transactions.plaidTransactionId,
      transferPairId: transactions.transferPairId,
    })
    .from(transactions)
    .where(
      scoped.where(transactions, eq(transactions.id, parsedId.data), notDeleted(transactions)),
    )
    .get();

  if (!existing) return { error: "Transaction not found" };

  const fields = parsedData.data;

  if (fields.date && existing.plaidTransactionId) {
    return { error: "Cannot edit date on bank-synced transactions" };
  }

  if (fields.isTransfer === false && existing.transferPairId) {
    db.transaction(() => {
      db.update(transactions)
        .set({ isTransfer: false, transferPairId: null, updatedAt: nowISO() })
        .where(eq(transactions.id, existing.id))
        .run();
      db.update(transactions)
        .set({ isTransfer: false, transferPairId: null, updatedAt: nowISO() })
        .where(eq(transactions.id, existing.transferPairId!))
        .run();
    });
    const { isTransfer: _, ...rest } = fields;
    if (Object.keys(rest).length === 0) return { success: true };
  }

  const updates: Partial<typeof transactions.$inferInsert> = { updatedAt: nowISO() };
  if (fields.name !== undefined) updates.name = fields.name;
  if (fields.notes !== undefined) updates.notes = fields.notes;
  if (fields.date !== undefined) updates.date = fields.date;
  if (fields.isTransfer !== undefined) updates.isTransfer = fields.isTransfer;

  db.update(transactions)
    .set(updates)
    .where(eq(transactions.id, existing.id))
    .run();

  return { success: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --run tests/integration/transaction-detail.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/actions/transaction-detail.ts tests/integration/transaction-detail.test.ts
git commit -m "feat: add updateTransactionFields action with Zod validation"
```

---

### Task 5: Server Actions — Split CRUD

**Files:**
- Modify: `src/actions/transaction-detail.ts`
- Modify: `tests/integration/transaction-detail.test.ts`

- [ ] **Step 1: Write the failing tests for upsertSplit and deleteSplit**

Add to `tests/integration/transaction-detail.test.ts`:

```ts
import { upsertSplit, deleteSplit } from "@/actions/transaction-detail";

// Create a fresh transaction for split tests:
const splitTxnId = uuid();

// Add to beforeAll:
// db.insert(transactions).values({
//   id: splitTxnId, accountId, householdId, date: "2026-05-10",
//   originalName: "COSTCO", name: "Costco", amount: 10000, normalizedAmount: -10000,
// }).run();

describe("upsertSplit", () => {
  it("creates a split and sets categorySource to manual", async () => {
    const result = await upsertSplit(
      splitTxnId,
      null,
      { categoryId: catGroceries, amount: 6000, notes: "food" },
      db,
    );

    expect("data" in result).toBe(true);
    if (!("data" in result)) return;
    expect(result.data.categoryId).toBe(catGroceries);
    expect(result.data.amount).toBe(6000);

    const detail = getTransactionDetail(householdId, splitTxnId, db);
    expect(detail!.hasSplits).toBe(true);
    expect(detail!.categorySource).toBe("manual");
  });

  it("rejects split that exceeds transaction amount", async () => {
    const result = await upsertSplit(
      splitTxnId,
      null,
      { categoryId: catDining, amount: 5000, notes: null },
      db,
    );

    // 6000 (existing) + 5000 = 11000 > 10000. Should reject.
    expect(result).toEqual({ error: "Splits exceed transaction amount" });
  });

  it("updates an existing split", async () => {
    const detail = getTransactionDetail(householdId, splitTxnId, db);
    const existingSplit = detail!.splits[0];

    const result = await upsertSplit(
      splitTxnId,
      existingSplit.id,
      { categoryId: catDining, amount: 4000, notes: "updated" },
      db,
    );

    expect("data" in result).toBe(true);
    if (!("data" in result)) return;
    expect(result.data.amount).toBe(4000);
  });
});

describe("deleteSplit", () => {
  it("deletes a split and clears hasSplits when last one removed", async () => {
    const detail = getTransactionDetail(householdId, splitTxnId, db);
    for (const split of detail!.splits) {
      const result = await deleteSplit(split.id, splitTxnId, db);
      expect(result).toEqual({ success: true });
    }

    const afterDelete = getTransactionDetail(householdId, splitTxnId, db);
    expect(afterDelete!.hasSplits).toBe(false);
    expect(afterDelete!.splits).toHaveLength(0);
  });
});
```

Also add `splitTxnId` setup in the `beforeAll`:

```ts
  db.insert(transactions)
    .values({
      id: splitTxnId,
      accountId,
      householdId,
      date: "2026-05-10",
      originalName: "COSTCO",
      name: "Costco",
      amount: 10000,
      normalizedAmount: -10000,
    })
    .run();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run tests/integration/transaction-detail.test.ts`
Expected: FAIL — `upsertSplit` and `deleteSplit` not found.

- [ ] **Step 3: Implement upsertSplit**

Add to `src/actions/transaction-detail.ts`:

```ts
const splitSchema = z.object({
  categoryId: z.string().min(1),
  amount: z.number().int().positive(),
  notes: z.string().max(500).nullable(),
});

export async function upsertSplit(
  transactionId: string,
  splitId: string | null,
  data: z.input<typeof splitSchema>,
  db: LedgrDb = defaultDb,
): Promise<{ data: { id: string; categoryId: string; amount: number; notes: string | null } } | { error: string }> {
  const householdId = await getHouseholdId();
  const parsedId = transactionIdSchema.safeParse(transactionId);
  const parsedData = splitSchema.safeParse(data);
  if (!parsedId.success || !parsedData.success) return { error: "Invalid input" };

  const scoped = scopedQuery(householdId, db);
  const txn = db
    .select({
      id: transactions.id,
      normalizedAmount: transactions.normalizedAmount,
    })
    .from(transactions)
    .where(scoped.where(transactions, eq(transactions.id, parsedId.data), notDeleted(transactions)))
    .get();

  if (!txn) return { error: "Transaction not found" };

  const fields = parsedData.data;
  const maxAmount = Math.abs(txn.normalizedAmount);

  return db.transaction(() => {
    const existingSplits = db
      .select({ id: transactionSplits.id, amount: transactionSplits.amount })
      .from(transactionSplits)
      .where(eq(transactionSplits.transactionId, txn.id))
      .all();

    const otherSplitsTotal = existingSplits
      .filter((s) => s.id !== splitId)
      .reduce((sum, s) => sum + s.amount, 0);

    if (otherSplitsTotal + fields.amount > maxAmount) {
      return { error: "Splits exceed transaction amount" };
    }

    let savedId: string;

    if (splitId) {
      db.update(transactionSplits)
        .set({
          categoryId: fields.categoryId,
          amount: fields.amount,
          notes: fields.notes,
        })
        .where(eq(transactionSplits.id, splitId))
        .run();
      savedId = splitId;
    } else {
      savedId = uuid();
      db.insert(transactionSplits)
        .values({
          id: savedId,
          transactionId: txn.id,
          categoryId: fields.categoryId,
          amount: fields.amount,
          notes: fields.notes,
        })
        .run();
    }

    if (existingSplits.length === 0 && !splitId) {
      db.update(transactions)
        .set({ categorySource: "manual", updatedAt: nowISO() })
        .where(eq(transactions.id, txn.id))
        .run();
    }

    return {
      data: {
        id: savedId,
        categoryId: fields.categoryId,
        amount: fields.amount,
        notes: fields.notes ?? null,
      },
    };
  });
}
```

- [ ] **Step 4: Implement deleteSplit**

Add to `src/actions/transaction-detail.ts`:

```ts
export async function deleteSplit(
  splitId: string,
  _transactionId: string,
  db: LedgrDb = defaultDb,
): Promise<{ success: true } | { error: string }> {
  const householdId = await getHouseholdId();
  const parsedSplitId = transactionIdSchema.safeParse(splitId);
  if (!parsedSplitId.success) return { error: "Invalid input" };

  const split = db
    .select({ id: transactionSplits.id, transactionId: transactionSplits.transactionId })
    .from(transactionSplits)
    .where(eq(transactionSplits.id, parsedSplitId.data))
    .get();

  if (!split) return { error: "Split not found" };

  const scoped = scopedQuery(householdId, db);
  const txn = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(scoped.where(transactions, eq(transactions.id, split.transactionId), notDeleted(transactions)))
    .get();

  if (!txn) return { error: "Transaction not found" };

  return db.transaction(() => {
    db.delete(transactionSplits)
      .where(eq(transactionSplits.id, split.id))
      .run();

    const remaining = db
      .select({ count: sql<number>`count(*)` })
      .from(transactionSplits)
      .where(eq(transactionSplits.transactionId, txn.id))
      .get();

    if (remaining && remaining.count === 0) {
      db.update(transactions)
        .set({ updatedAt: nowISO() })
        .where(eq(transactions.id, txn.id))
        .run();
    }

    return { success: true };
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- --run tests/integration/transaction-detail.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/actions/transaction-detail.ts tests/integration/transaction-detail.test.ts
git commit -m "feat: add upsertSplit and deleteSplit with atomicity + sum validation"
```

---

### Task 6: CurrencyInput Atom

**Files:**
- Create: `src/components/atoms/currency-input.tsx`
- Create: `src/components/atoms/currency-input.test.ts`

- [ ] **Step 1: Write the unit test**

Create `src/components/atoms/currency-input.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseToCents, centsToInputDisplay } from "@/lib/money";

describe("currency conversion roundtrip", () => {
  it("converts cents to display and back", () => {
    expect(centsToInputDisplay(1250)).toBe("12.50");
    expect(parseToCents("12.50")).toBe(1250);
  });

  it("handles dollar sign and commas", () => {
    expect(parseToCents("$1,234.56")).toBe(123456);
  });

  it("handles whole dollar amounts", () => {
    expect(parseToCents("50")).toBe(5000);
  });

  it("returns null for empty string", () => {
    expect(parseToCents("")).toBeNull();
  });

  it("returns null for non-numeric input", () => {
    expect(parseToCents("abc")).toBeNull();
  });

  it("handles zero", () => {
    expect(centsToInputDisplay(0)).toBe("0.00");
    expect(parseToCents("0")).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it passes (these test existing lib/money.ts)**

Run: `pnpm test -- --run src/components/atoms/currency-input.test.ts`
Expected: PASS — these test `parseToCents`/`centsToInputDisplay` from `lib/money.ts`.

- [ ] **Step 3: Create the CurrencyInput component**

Create `src/components/atoms/currency-input.tsx`:

```tsx
"use client";

import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { centsToInputDisplay, parseToCents } from "@/lib/money";
import { cn } from "@/lib/utils";

interface CurrencyInputProps {
  value: number;
  onChange: (cents: number) => void;
  onBlur?: () => void;
  disabled?: boolean;
  className?: string;
}

export function CurrencyInput({
  value,
  onChange,
  onBlur,
  disabled = false,
  className,
}: CurrencyInputProps) {
  const [display, setDisplay] = useState(centsToInputDisplay(value));

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setDisplay(raw);
      const cents = parseToCents(raw);
      if (cents !== null) onChange(cents);
    },
    [onChange],
  );

  const handleBlur = useCallback(() => {
    const cents = parseToCents(display);
    if (cents !== null) {
      setDisplay(centsToInputDisplay(cents));
      onChange(cents);
    } else {
      setDisplay(centsToInputDisplay(value));
    }
    onBlur?.();
  }, [display, value, onChange, onBlur]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      disabled={disabled}
      className={cn("text-right tabular-nums", className)}
    />
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/atoms/currency-input.tsx src/components/atoms/currency-input.test.ts
git commit -m "feat: add CurrencyInput atom with cents conversion"
```

---

### Task 7: EditableText Molecule

**Files:**
- Create: `src/components/molecules/editable-text.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState, useRef, useCallback, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface EditableTextProps {
  value: string;
  onSave: (value: string) => Promise<{ success: true } | { error: string }>;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
}

export function EditableText({
  value,
  onSave,
  placeholder = "Click to edit",
  className,
  inputClassName,
  disabled = false,
}: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const savedRef = useRef(value);
  const [isPending, startTransition] = useTransition();

  const handleClick = useCallback(() => {
    if (!disabled) setIsEditing(true);
  }, [disabled]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (localValue === savedRef.current) return;

    startTransition(async () => {
      const result = await onSave(localValue);
      if ("error" in result) {
        setLocalValue(savedRef.current);
      } else {
        savedRef.current = localValue;
      }
    });
  }, [localValue, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        (e.target as HTMLInputElement).blur();
      }
      if (e.key === "Escape") {
        setLocalValue(savedRef.current);
        setIsEditing(false);
      }
    },
    [],
  );

  if (isEditing) {
    return (
      <Input
        autoFocus
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={isPending}
        className={cn("h-auto py-0.5 px-1 text-sm", inputClassName)}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        "text-left text-sm cursor-pointer rounded px-1 py-0.5 -mx-1",
        "hover:bg-muted/50 hover:underline decoration-muted-foreground/40 underline-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        !localValue && "text-muted-foreground italic",
        isPending && "opacity-50",
        className,
      )}
    >
      {localValue || placeholder}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/molecules/editable-text.tsx
git commit -m "feat: add EditableText molecule with text-to-input pattern"
```

---

### Task 8: TransactionMetadata Molecule

**Files:**
- Create: `src/components/molecules/transaction-metadata.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface TransactionMetadataProps {
  originalName: string;
  categorySource: string | null;
  plaidTransactionId: string | null;
  transferPairId: string | null;
  onSelectTransferPair?: (id: string) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  ai: "AI",
  rule: "Rule",
  plaid: "Plaid",
  pfc: "Plaid (PFC)",
};

export function TransactionMetadata({
  originalName,
  categorySource,
  plaidTransactionId,
  transferPairId,
  onSelectTransferPair,
}: TransactionMetadataProps) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <Separator className="my-3" />
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        Details
      </button>

      {open && (
        <div className="mt-2 space-y-2 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Original description</span>
            <span className="text-foreground font-mono text-[11px] max-w-[60%] truncate text-right">
              {originalName}
            </span>
          </div>
          {categorySource && (
            <div className="flex justify-between items-center">
              <span>Category source</span>
              <Badge variant="outline" className="text-[10px] h-5">
                {SOURCE_LABELS[categorySource] ?? categorySource}
              </Badge>
            </div>
          )}
          {plaidTransactionId && (
            <div className="flex justify-between">
              <span>Plaid ID</span>
              <span className="font-mono text-[11px] max-w-[60%] truncate text-right">
                {plaidTransactionId}
              </span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span>Transfer pair</span>
            {transferPairId ? (
              <button
                type="button"
                onClick={() => onSelectTransferPair?.(transferPairId)}
                className="text-primary hover:underline text-[11px]"
              >
                View paired transaction
              </button>
            ) : (
              <span>—</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/molecules/transaction-metadata.tsx
git commit -m "feat: add TransactionMetadata collapsible section"
```

---

### Task 9: TransactionSplitRow Molecule

**Files:**
- Create: `src/components/molecules/transaction-split-row.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState, useTransition, useRef, useCallback } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/atoms/currency-input";
import { CategoryPill } from "@/components/molecules/category-pill";
import type { CategoryGroup } from "@/queries/categories";
import type { SplitRow } from "@/queries/transactions";
import { upsertSplit } from "@/actions/transaction-detail";

interface TransactionSplitRowProps {
  transactionId: string;
  split: SplitRow & { isDraft?: boolean };
  categories: CategoryGroup[];
  onUpdate: (split: SplitRow) => void;
  onDelete: (splitId: string) => void;
}

export function TransactionSplitRow({
  transactionId,
  split,
  categories,
  onUpdate,
  onDelete,
}: TransactionSplitRowProps) {
  const [amount, setAmount] = useState(split.amount);
  const savedAmount = useRef(split.amount);
  const [isPending, startTransition] = useTransition();

  const handleAmountBlur = useCallback(() => {
    if (amount === savedAmount.current) return;
    if (!split.categoryId) return;

    startTransition(async () => {
      const result = await upsertSplit(
        transactionId,
        split.isDraft ? null : split.id,
        { categoryId: split.categoryId, amount, notes: split.notes },
      );
      if ("error" in result) {
        setAmount(savedAmount.current);
      } else {
        savedAmount.current = amount;
        onUpdate({ ...split, id: result.data.id, amount: result.data.amount });
      }
    });
  }, [amount, split, transactionId, onUpdate]);

  return (
    <div className="grid grid-cols-[1fr_100px_32px] items-center gap-1.5 py-1">
      <div className="min-w-0">
        {split.isDraft && !split.categoryId ? (
          <span className="text-xs text-destructive italic px-1">Select a category</span>
        ) : (
          <CategoryPill
            transactionId={transactionId}
            currentCategoryId={split.categoryId}
            currentCategoryName={split.categoryName}
            categories={categories}
          />
        )}
      </div>

      <CurrencyInput
        value={amount}
        onChange={setAmount}
        onBlur={handleAmountBlur}
        disabled={isPending || !split.categoryId}
        className="h-7 text-xs"
      />

      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        disabled={isPending}
        onClick={() => onDelete(split.id)}
      >
        <Trash2 className="size-3.5 text-muted-foreground" />
      </Button>
    </div>
  );
}
```

Note: The `CategoryPill` component is reused directly. When used inside a split row, the `transactionId` prop is the parent transaction ID — the category update will be handled differently. We'll need to adapt `CategoryPill` to accept an optional `onCategoryChange` callback for split-specific handling. For now, the split row manages its own category state through `onUpdate`.

- [ ] **Step 2: Commit**

```bash
git add src/components/molecules/transaction-split-row.tsx
git commit -m "feat: add TransactionSplitRow molecule with inline editing"
```

---

### Task 10: TransactionDetailPanel Organism

**Files:**
- Create: `src/components/organisms/transaction-detail-panel.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import { X, Plus, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AmountDisplay } from "@/components/atoms/amount-display";
import { EntityAvatar } from "@/components/atoms/entity-avatar";
import { EditableText } from "@/components/molecules/editable-text";
import { CategoryPill } from "@/components/molecules/category-pill";
import { TransactionSplitRow } from "@/components/molecules/transaction-split-row";
import { TransactionMetadata } from "@/components/molecules/transaction-metadata";
import {
  fetchTransactionDetail,
  updateTransactionFields,
  upsertSplit,
  deleteSplit,
} from "@/actions/transaction-detail";
import { toggleReviewed } from "@/actions/transactions";
import { centsToDisplay } from "@/lib/money";
import { formatDateShort } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import type { TransactionRow as TxnRow, SplitRow, TransactionDetail } from "@/queries/transactions";
import type { CategoryGroup } from "@/queries/categories";

interface TransactionDetailPanelProps {
  transactionId: string;
  initialData: TxnRow | null;
  categories: CategoryGroup[];
  onClose: () => void;
  onTransactionUpdated: (updated: TxnRow) => void;
  onSelectTransaction: (id: string) => void;
}

export function TransactionDetailPanel({
  transactionId,
  initialData,
  categories,
  onClose,
  onTransactionUpdated,
  onSelectTransaction,
}: TransactionDetailPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [txn, setTxn] = useState<TxnRow | null>(initialData);
  const [splits, setSplits] = useState<(SplitRow & { isDraft?: boolean })[]>([]);
  const [detailLoaded, setDetailLoaded] = useState(false);
  const [reviewed, setReviewed] = useState(initialData?.reviewed ?? false);
  const [reviewPending, startReviewTransition] = useTransition();

  useEffect(() => {
    headingRef.current?.focus();
  }, [transactionId]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setDetailLoaded(false);

    fetchTransactionDetail(transactionId).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        onClose();
        return;
      }
      const detail = result.data;
      setTxn(detail);
      setSplits(detail.splits);
      setReviewed(detail.reviewed);
      setDetailLoaded(true);
    });

    return () => { cancelled = true; };
  }, [transactionId, onClose]);

  const handleFieldSave = useCallback(
    async (field: string, value: string) => {
      const result = await updateTransactionFields(transactionId, { [field]: value });
      if ("success" in result && txn) {
        const updated = { ...txn, [field]: value };
        setTxn(updated);
        onTransactionUpdated(updated);
      }
      return result;
    },
    [transactionId, txn, onTransactionUpdated],
  );

  const handleReviewedToggle = useCallback(() => {
    const prev = reviewed;
    setReviewed(!prev);
    startReviewTransition(async () => {
      const result = await toggleReviewed(transactionId);
      if ("error" in result) setReviewed(prev);
      else if (txn) onTransactionUpdated({ ...txn, reviewed: result.reviewed });
    });
  }, [reviewed, transactionId, txn, onTransactionUpdated]);

  const handleAddSplit = useCallback(() => {
    setSplits((prev) => [
      ...prev,
      {
        id: `draft-${Date.now()}`,
        categoryId: "",
        categoryName: null,
        categoryIcon: null,
        amount: 0,
        notes: null,
        isDraft: true,
      },
    ]);
  }, []);

  const handleSplitUpdate = useCallback((updated: SplitRow) => {
    setSplits((prev) =>
      prev.map((s) =>
        s.id === updated.id || (s.isDraft && s.id.startsWith("draft-"))
          ? { ...updated, isDraft: false }
          : s,
      ),
    );
  }, []);

  const handleSplitDelete = useCallback(
    async (splitId: string) => {
      const prev = splits;
      setSplits((s) => s.filter((r) => r.id !== splitId));

      if (!splitId.startsWith("draft-")) {
        const result = await deleteSplit(splitId, transactionId);
        if ("error" in result) setSplits(prev);
      }
    },
    [splits, transactionId],
  );

  if (!txn) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  const hasDraftSplits = splits.some((s) => s.isDraft && !s.categoryId);
  const totalSplitAmount = splits.reduce((sum, s) => sum + s.amount, 0);
  const remaining = Math.abs(txn.normalizedAmount) - totalSplitAmount;
  const isPlaidSynced = Boolean(txn.plaidTransactionId);

  return (
    <div
      role="complementary"
      aria-label="Transaction details"
      className="h-full overflow-y-auto"
    >
      <div className="sticky top-0 bg-background z-10 flex items-center justify-between px-4 py-3 border-b">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-sm font-semibold text-muted-foreground outline-none"
        >
          Transaction Details
        </h2>
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="p-4 space-y-4">
        {/* Identity Section */}
        <div className="flex items-start gap-3">
          <EntityAvatar
            logoUrl={txn.merchantLogoUrl}
            name={txn.merchantName ?? txn.name}
            pfcPrimary={txn.pfcPrimary}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <EditableText
              value={txn.name}
              onSave={(v) => handleFieldSave("name", v)}
              className="font-semibold"
            />
            <p className="text-xs text-muted-foreground mt-0.5">{txn.accountName}</p>
            <div className="flex items-center gap-2 mt-1">
              {isPlaidSynced ? (
                <span className="text-xs text-muted-foreground" title="Date is managed by your bank">
                  {formatDateShort(txn.date)}
                </span>
              ) : (
                <EditableText
                  value={txn.date}
                  onSave={(v) => handleFieldSave("date", v)}
                  className="text-xs text-muted-foreground"
                  inputClassName="w-28"
                />
              )}
              {txn.pending && (
                <Badge variant="outline" className="text-[10px] h-5 gap-1">
                  <Clock className="size-3" /> Pending
                </Badge>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* Amount Section */}
        <div className="text-center py-2">
          <div className="text-2xl font-semibold tabular-nums">
            <AmountDisplay amount={txn.normalizedAmount} currency={txn.currency} />
          </div>
        </div>

        <Separator />

        {/* Category Section */}
        {splits.length === 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Category</p>
            <CategoryPill
              transactionId={txn.id}
              currentCategoryId={txn.categoryId}
              currentCategoryName={txn.categoryName}
              categories={categories}
            />
          </div>
        )}

        {/* Splits Section */}
        <div>
          {splits.length > 0 && (
            <div className="bg-muted/30 rounded-lg p-3 space-y-1">
              <p className="text-xs text-muted-foreground mb-1">Splits</p>
              {splits.map((split) => (
                <TransactionSplitRow
                  key={split.id}
                  transactionId={txn.id}
                  split={split}
                  categories={categories}
                  onUpdate={handleSplitUpdate}
                  onDelete={handleSplitDelete}
                />
              ))}
              <div className={cn(
                "flex justify-between text-xs pt-1 border-t border-border/50 mt-1",
                remaining === 0 ? "text-emerald-600" : "text-destructive",
              )}>
                <span>Remaining</span>
                <span className="tabular-nums">{centsToDisplay(remaining)}</span>
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-xs"
            onClick={handleAddSplit}
            disabled={hasDraftSplits}
          >
            <Plus className="size-3 mr-1" /> Add Split
          </Button>
        </div>

        <Separator />

        {/* Notes Section */}
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Notes</p>
          <EditableText
            value={txn.notes ?? ""}
            onSave={(v) => handleFieldSave("notes", v)}
            placeholder="Add notes..."
            className="text-sm"
          />
        </div>

        <Separator />

        {/* Reviewed Toggle */}
        <div className="flex items-center gap-2">
          <Switch
            id="reviewed"
            checked={reviewed}
            onCheckedChange={handleReviewedToggle}
            disabled={reviewPending}
          />
          <Label htmlFor="reviewed" className="text-sm cursor-pointer">
            Mark as Reviewed
          </Label>
        </div>

        {/* Metadata Section */}
        {detailLoaded && (
          <TransactionMetadata
            originalName={txn.originalName}
            categorySource={txn.categorySource ?? null}
            plaidTransactionId={txn.plaidTransactionId ?? null}
            transferPairId={txn.transferPairId ?? null}
            onSelectTransferPair={onSelectTransaction}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm typecheck`
Expected: No new type errors. If there are issues with `TransactionRow` not having `categorySource`/`plaidTransactionId`/etc., those fields were added in Task 1.

- [ ] **Step 3: Commit**

```bash
git add src/components/organisms/transaction-detail-panel.tsx
git commit -m "feat: add TransactionDetailPanel organism"
```

---

### Task 11: Modify TransactionRow — onClick, isActive, Keyboard Access, React.memo

**Files:**
- Modify: `src/components/molecules/transaction-row.tsx`

- [ ] **Step 1: Update the component**

Replace the full content of `src/components/molecules/transaction-row.tsx`:

```tsx
"use client";

import { memo, useCallback } from "react";
import { Clock } from "lucide-react";
import { AmountDisplay } from "@/components/atoms/amount-display";
import { EntityAvatar } from "@/components/atoms/entity-avatar";
import { CategoryPill } from "@/components/molecules/category-pill";
import { ReviewedDot } from "@/components/molecules/reviewed-dot";
import type { TransactionRow as TxnRow } from "@/queries/transactions";
import type { CategoryGroup } from "@/queries/categories";
import { cn } from "@/lib/utils";

export const TRANSACTION_GRID_COLS =
  "grid-cols-[24px_32px_1fr_auto_100px]" as const;

interface TransactionRowProps {
  transaction: TxnRow;
  categories: CategoryGroup[];
  isSelected: boolean;
  isActive?: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onClick?: () => void;
}

export const TransactionRow = memo(function TransactionRow({
  transaction: txn,
  categories,
  isSelected,
  isActive = false,
  onSelect,
  onClick,
}: TransactionRowProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick?.();
      }
    },
    [onClick],
  );

  const handleCheckboxChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      onSelect(txn.id, e.target.checked);
    },
    [txn.id, onSelect],
  );

  const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={cn(
        `group/row grid ${TRANSACTION_GRID_COLS} items-center h-9 px-2 border-b text-sm hover:bg-muted/50 transition-colors cursor-pointer`,
        txn.pending && "opacity-60",
        isActive && "bg-muted",
      )}
    >
      <div onClick={handleCheckboxClick}>
        <ReviewedDot
          key={`${txn.id}-reviewed-${txn.reviewed}`}
          transactionId={txn.id}
          reviewed={txn.reviewed}
        />
      </div>

      <div className="flex items-center justify-center" onClick={handleCheckboxClick}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={handleCheckboxChange}
          className="h-3.5 w-3.5 rounded border-muted-foreground/30"
        />
      </div>

      <div className="flex items-center gap-1.5 pr-2 min-w-0">
        <EntityAvatar
          logoUrl={txn.merchantLogoUrl}
          name={txn.merchantName ?? txn.name}
          pfcPrimary={txn.pfcPrimary}
          size="sm"
        />
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          {txn.pending && <Clock className="size-3 text-muted-foreground shrink-0" />}
          <span className="font-medium truncate">{txn.name}</span>
          {txn.originalName !== txn.name && (
            <span className="text-xs text-muted-foreground hidden group-hover/row:inline truncate">
              ({txn.originalName})
            </span>
          )}
          <span className="hidden sm:inline text-[10px] text-muted-foreground shrink-0 max-w-[100px] truncate">
            {txn.accountName}
          </span>
        </div>
      </div>

      <div onClick={handleCheckboxClick}>
        <CategoryPill
          key={`${txn.id}-cat-${txn.categoryId}`}
          transactionId={txn.id}
          currentCategoryId={txn.categoryId}
          currentCategoryName={txn.categoryName}
          categories={categories}
          disabled={txn.hasSplits}
        />
      </div>

      <div className="text-right">
        <AmountDisplay amount={txn.normalizedAmount} currency={txn.currency} pending={txn.pending} />
      </div>
    </div>
  );
});
```

Key changes:
- Wrapped in `memo()` for performance
- Added `onClick`, `isActive` props
- Added `role="button"`, `tabIndex={0}`, `onKeyDown` for keyboard access
- Added `stopPropagation` on checkbox, reviewed dot, and category pill clicks
- Added `cursor-pointer` class
- Added `isActive && "bg-muted"` highlight

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/molecules/transaction-row.tsx
git commit -m "feat: add onClick, isActive, keyboard access to TransactionRow + React.memo"
```

---

### Task 12: Modify TransactionList — Push Layout + Panel Integration

**Files:**
- Modify: `src/components/organisms/transaction-list.tsx`

- [ ] **Step 1: Update the component**

Replace the full content of `src/components/organisms/transaction-list.tsx`:

```tsx
"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TransactionRow, TRANSACTION_GRID_COLS } from "@/components/molecules/transaction-row";
import { TransactionDateHeader } from "@/components/molecules/transaction-date-header";
import { BulkActionBar } from "@/components/molecules/bulk-action-bar";
import { TransactionDetailPanel } from "@/components/organisms/transaction-detail-panel";
import { loadMoreTransactions } from "@/actions/transactions";
import { groupByDate } from "@/lib/transactions";
import { useSelectedTransaction } from "@/hooks/use-selected-transaction";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
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
  const isMobile = useIsMobile();
  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(nextCursor);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const { selectedId, select, clear } = useSelectedTransaction();
  const activeRowRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => groupByDate(rows), [rows]);

  const selectedRow = useMemo(
    () => (selectedId ? rows.find((r) => r.id === selectedId) ?? null : null),
    [selectedId, rows],
  );

  const isPanelOpen = selectedId !== null;

  // Close panel when bulk selection is active
  useEffect(() => {
    if (selected.size > 0 && isPanelOpen) clear();
  }, [selected.size, isPanelOpen, clear]);

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

  const handleTransactionUpdated = useCallback((updated: TxnRow) => {
    setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }, []);

  const handlePanelClose = useCallback(() => {
    clear();
    activeRowRef.current?.focus();
  }, [clear]);

  const hasBulkSelection = selected.size > 0;

  return (
    <div
      className={cn(
        "group/list grid transition-[grid-template-columns] duration-200 ease-out",
        isPanelOpen && !isMobile
          ? "grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
          : "grid-cols-[1fr]",
      )}
      data-bulk-active={hasBulkSelection ? "" : undefined}
    >
      {/* List Column */}
      <div className="min-w-0 overflow-hidden">
        {hasBulkSelection && (
          <BulkActionBar
            selectedIds={Array.from(selected)}
            categories={categories}
            onComplete={handleBulkComplete}
          />
        )}

        <div className={`grid ${TRANSACTION_GRID_COLS} items-center h-8 px-2 border-b text-xs font-medium text-muted-foreground`}>
          <div />
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              checked={selected.size > 0 && selected.size === rows.length}
              onChange={handleSelectAll}
              className="h-3.5 w-3.5 rounded border-muted-foreground/30"
            />
          </div>
          <span>Description</span>
          <span>Category</span>
          <span className="text-right">Amount</span>
        </div>

        {groups.map((group) => {
          const netAmount = group.rows.reduce((sum, r) => sum + r.normalizedAmount, 0);
          return (
            <div key={group.date}>
              <TransactionDateHeader
                date={group.date}
                transactionCount={group.rows.length}
                netAmount={netAmount}
              />
              {group.rows.map((txn) => (
                <TransactionRow
                  key={txn.id}
                  transaction={txn}
                  categories={categories}
                  isSelected={selected.has(txn.id)}
                  isActive={txn.id === selectedId}
                  onSelect={handleSelect}
                  onClick={() => select(txn.id)}
                />
              ))}
            </div>
          );
        })}

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

      {/* Detail Panel Column */}
      {isPanelOpen && (
        <div
          className={cn(
            "border-l bg-background",
            isMobile
              ? "fixed inset-0 z-50"
              : "h-[calc(100vh-8rem)] sticky top-32",
          )}
        >
          {/* Live region for screen readers */}
          <div className="sr-only" aria-live="polite">
            Transaction details opened
          </div>
          <TransactionDetailPanel
            transactionId={selectedId}
            initialData={selectedRow}
            categories={categories}
            onClose={handlePanelClose}
            onTransactionUpdated={handleTransactionUpdated}
            onSelectTransaction={select}
          />
        </div>
      )}
    </div>
  );
}
```

Key changes:
- CSS grid push layout with `grid-cols-[minmax(0,3fr)_minmax(0,2fr)]`
- `useSelectedTransaction` hook for URL state
- `useIsMobile` for mobile full-screen overlay fallback
- `handleTransactionUpdated` patches single row in state
- Panel closes when bulk selection is active
- Focus restoration via `activeRowRef`
- `aria-live` region for screen reader announcement
- `overflow-hidden` on list column for truncation

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Run all tests**

Run: `pnpm test -- --run`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/organisms/transaction-list.tsx
git commit -m "feat: integrate push-layout detail panel into TransactionList"
```

---

### Task 13: Property-Based Test for Split Remaining Balance

**Files:**
- Modify: `tests/integration/transaction-detail.test.ts`

- [ ] **Step 1: Add property-based test**

Add to `tests/integration/transaction-detail.test.ts`:

```ts
import { test } from "@fast-check/vitest";
import * as fc from "fast-check";

describe("split remaining balance math", () => {
  test.prop([
    fc.integer({ min: 100, max: 10_000_00 }),
    fc.array(fc.integer({ min: 1, max: 1_000_00 }), { minLength: 1, maxLength: 10 }),
  ])("sum of splits + remaining equals abs(amount)", (totalCents, rawSplitAmounts) => {
    const absTotal = Math.abs(totalCents);
    const cappedSplits: number[] = [];
    let runningTotal = 0;

    for (const amt of rawSplitAmounts) {
      if (runningTotal + amt > absTotal) break;
      cappedSplits.push(amt);
      runningTotal += amt;
    }

    const splitSum = cappedSplits.reduce((s, a) => s + a, 0);
    const remaining = absTotal - splitSum;

    expect(splitSum + remaining).toBe(absTotal);
    expect(remaining).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test**

Run: `pnpm test -- --run tests/integration/transaction-detail.test.ts`
Expected: All tests PASS including the property-based test.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/transaction-detail.test.ts
git commit -m "test: add property-based test for split remaining balance math"
```

---

### Task 14: Manual Verification

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev`

- [ ] **Step 2: Test the golden path**

1. Navigate to `/transactions`
2. Click a transaction row → verify panel slides in from right, list shrinks to 60%
3. Edit the merchant name → blur → verify it saves and updates the list row
4. Edit notes → blur → verify it saves
5. Click "Add Split" → verify draft row appears with "Select a category" message
6. Select a category for the split → enter an amount → blur → verify it saves
7. Check remaining balance shows correctly (green at $0, red otherwise)
8. Delete a split → verify it removes and remaining updates
9. Toggle "Mark as Reviewed" → verify dot changes in list row
10. Click the X button → verify panel closes and list returns to full width
11. Press Escape → verify panel closes

- [ ] **Step 3: Test edge cases**

1. Click a pending transaction → verify "Pending" badge shows, date is read-only if Plaid-synced
2. Open panel → select some checkboxes → verify panel closes when bulk bar appears
3. Resize browser below 768px → verify panel becomes full-screen overlay
4. Keyboard navigation: Tab to a row → press Enter → verify panel opens → press Escape → verify it closes and focus returns to row

- [ ] **Step 4: Run the full test suite**

Run: `pnpm test -- --run && pnpm typecheck && pnpm lint`
Expected: All pass.

- [ ] **Step 5: Commit any fixes from manual testing**

```bash
git add -u
git commit -m "fix: address issues found during manual verification"
```
