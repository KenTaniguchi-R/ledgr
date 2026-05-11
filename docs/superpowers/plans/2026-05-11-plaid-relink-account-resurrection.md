# Plaid Re-Link Account Resurrection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix data orphaning when users disconnect and re-link a Plaid institution by resurrecting soft-deleted accounts instead of creating new ones.

**Architecture:** Preserve `plaidAccountId` on disconnect (removing only `plaidItemId`). On re-link, match incoming Plaid accounts against soft-deleted accounts by `plaidAccountId` + `householdId`; reactivate matches instead of inserting new rows. Add `isNull(deletedAt)` filters to two sync queries that currently leak deleted accounts. Add a partial index for the match query. Write a one-time migration script for already-orphaned data.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL, Vitest (integration tests with testcontainers)

**Spec:** `docs/superpowers/specs/2026-05-11-plaid-relink-account-resurrection-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/db/schema/accounts.ts` | Add partial index `idx_accounts_resurrection` |
| `src/actions/plaid.ts` | Preserve `plaidAccountId` on disconnect; match-or-create on exchange |
| `src/lib/plaid/sync.ts` | Add `isNull(deletedAt)` to `applyToDb` account lookup AND `accountTypeMap` builder |
| `src/db/seed/migrate-orphaned-accounts.ts` | New: one-time migration script with `--dry-run` support |
| `tests/integration/helpers.ts` | Add `insertSoftDeletedAccount` test helper |
| `tests/integration/plaid-disconnect.test.ts` | New: verify disconnect preserves `plaidAccountId` |
| `tests/integration/plaid-exchange.test.ts` | Add re-link resurrection tests |

---

### Task 1: Add Partial Index for Resurrection Match Query

**Files:**
- Modify: `src/db/schema/accounts.ts:39-43`

- [ ] **Step 1: Add the partial index to the accounts table definition**

In `src/db/schema/accounts.ts`, add a filtered index to the accounts table's index array. Drizzle supports `.where()` on indexes for partial indexes.

```typescript
// In the accounts table definition, add to the index array (3rd arg of pgTable):
(table) => [
  index("idx_accounts_household").on(table.householdId),
  index("idx_accounts_plaid_item").on(table.plaidItemId),
  index("idx_accounts_resurrection")
    .on(table.plaidAccountId, table.householdId)
    .where(sql`deleted_at IS NOT NULL`),
]
```

You'll need to add `sql` to the imports from `drizzle-orm/pg-core`:

```typescript
import {
  index,
  integer,
  pgTable,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  sql,
} from "drizzle-orm/pg-core";
```

- [ ] **Step 2: Generate the Drizzle migration**

Run: `pnpm db:generate`
Expected: A new migration file is created in `src/db/migrations/` containing `CREATE INDEX idx_accounts_resurrection`.

- [ ] **Step 3: Run the migration**

Run: `pnpm db:migrate`
Expected: Migration completes successfully.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/accounts.ts src/db/migrations/
git commit -m "feat: add partial index for account resurrection match query"
```

---

### Task 2: Preserve `plaidAccountId` on Disconnect

**Files:**
- Modify: `src/actions/plaid.ts:221-224`
- Create: `tests/integration/plaid-disconnect.test.ts`
- Modify: `tests/integration/helpers.ts`

- [ ] **Step 1: Add `insertSoftDeletedAccount` helper to `tests/integration/helpers.ts`**

Add this function at the end of the file:

```typescript
export async function insertSoftDeletedAccount(
  db: LedgrDb,
  householdId: string,
  overrides: Partial<typeof accounts.$inferInsert> = {},
) {
  const id = uuid();
  const now = new Date();
  await db.insert(accounts).values({
    id,
    householdId,
    name: "Deleted Account",
    type: "checking",
    currency: "USD",
    deletedAt: now,
    ...overrides,
  });
  return { accountId: id };
}
```

- [ ] **Step 2: Write the disconnect test file**

Create `tests/integration/plaid-disconnect.test.ts`:

```typescript
import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./setup";
import { server } from "../mocks/server";
import { accounts, plaidItems } from "@/db/schema";
import { disconnectPlaidItem } from "@/actions/plaid";
import { resetPlaidClient } from "@/lib/plaid/client";
import { insertHousehold, insertPlaidItem, insertAccount } from "./helpers";
import type { LedgrDb } from "@/db";

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(() => Promise.resolve({ user: { id: "test-user-id" } })),
  getHouseholdId: vi.fn(),
}));
vi.mock("@/lib/demo-mode", () => ({ guardDemoMode: vi.fn(() => null) }));

beforeAll(() => {
  vi.stubEnv("PLAID_CLIENT_ID", "test-id");
  vi.stubEnv("PLAID_SECRET", "test-secret");
  vi.stubEnv("PLAID_ENV", "sandbox");
  vi.stubEnv("ENCRYPTION_KEY", "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2");
  server.listen({ onUnhandledRequest: "bypass" });
});
afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

describe("disconnectPlaidItem", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;

  afterEach(async () => {
    server.resetHandlers();
    resetPlaidClient();
    await close?.();
  });

  it("preserves plaidAccountId on disconnect", async () => {
    ({ db, close } = await createTestDb());
    const { householdId } = await insertHousehold(db);
    const { plaidItemId } = await insertPlaidItem(db, householdId);
    await insertAccount(db, householdId, {
      plaidItemId,
      plaidAccountId: "plaid-acc-checking-123",
    });
    await insertAccount(db, householdId, {
      plaidItemId,
      plaidAccountId: "plaid-acc-savings-456",
    });

    // Mock authorizeAction to return our householdId
    const { getHouseholdId } = await import("@/lib/auth/session");
    vi.mocked(getHouseholdId).mockResolvedValue(householdId);

    await disconnectPlaidItem(plaidItemId, db);

    const accts = await db.select().from(accounts).where(eq(accounts.householdId, householdId));
    expect(accts).toHaveLength(2);

    for (const acct of accts) {
      expect(acct.deletedAt).not.toBeNull();
      expect(acct.plaidItemId).toBeNull();
      // Key assertion: plaidAccountId is preserved
      expect(acct.plaidAccountId).not.toBeNull();
    }

    expect(accts.map((a) => a.plaidAccountId).sort()).toEqual([
      "plaid-acc-checking-123",
      "plaid-acc-savings-456",
    ]);
  });

  it("hard-deletes the plaidItems row", async () => {
    ({ db, close } = await createTestDb());
    const { householdId } = await insertHousehold(db);
    const { plaidItemId } = await insertPlaidItem(db, householdId);
    await insertAccount(db, householdId, { plaidItemId });

    const { getHouseholdId } = await import("@/lib/auth/session");
    vi.mocked(getHouseholdId).mockResolvedValue(householdId);

    await disconnectPlaidItem(plaidItemId, db);

    const items = await db.select().from(plaidItems).where(eq(plaidItems.id, plaidItemId));
    expect(items).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test tests/integration/plaid-disconnect.test.ts`
Expected: FAIL — the "preserves plaidAccountId on disconnect" test fails because `plaidAccountId` is currently set to null.

- [ ] **Step 4: Fix the disconnect function**

In `src/actions/plaid.ts`, line 223, change:

```typescript
// Before
.set({ deletedAt: now, plaidItemId: null, plaidAccountId: null })

// After
.set({ deletedAt: now, plaidItemId: null })
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test tests/integration/plaid-disconnect.test.ts`
Expected: PASS — both tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/actions/plaid.ts tests/integration/plaid-disconnect.test.ts tests/integration/helpers.ts
git commit -m "feat: preserve plaidAccountId on disconnect for future re-link matching"
```

---

### Task 3: Match-or-Create on Exchange (Account Resurrection)

**Files:**
- Modify: `src/actions/plaid.ts:105-161` (the transaction inside `exchangeAndStoreAccounts`)
- Modify: `tests/integration/plaid-exchange.test.ts`

- [ ] **Step 1: Write the resurrection test**

Add to `tests/integration/plaid-exchange.test.ts`, inside the existing `describe("plaid exchange flow")` block. Add `isNull, isNotNull` to the `drizzle-orm` import and `insertHousehold, insertSoftDeletedAccount, insertTransaction, insertInvestmentHolding` to the helpers import:

```typescript
it("resurrects soft-deleted accounts on re-link instead of creating new ones", async () => {
  await setup();
  const hh = await provisionHousehold("user-relink", db);

  // Simulate a previous disconnect: create soft-deleted accounts with plaidAccountId preserved
  const { accountId: oldCheckingId } = await insertSoftDeletedAccount(db, hh, {
    plaidAccountId: "plaid-acc-checking",
    name: "Old Checking",
    type: "checking",
  });
  // Add a transaction to the old account to prove data is preserved
  await insertTransaction(db, hh, oldCheckingId, {
    name: "Old Transaction",
    notes: "user-edited-note",
  });

  // Now exchange (re-link) — MSW returns accounts with plaid-acc-checking, etc.
  const result = await exchangeAndStoreAccounts("public-sandbox-token", hh, db);
  expect(result.success).toBe(true);

  // The old account should be reactivated, not a new one created
  const allAccts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.householdId, hh));
  const activeAccts = allAccts.filter((a) => a.deletedAt === null);

  // Expect 4 accounts (matching MSW mock: checking, savings, credit, investment)
  // But the checking account should be the resurrected one
  const checking = activeAccts.find((a) => a.plaidAccountId === "plaid-acc-checking")!;
  expect(checking).toBeDefined();
  expect(checking.id).toBe(oldCheckingId); // same UUID = resurrected
  expect(checking.deletedAt).toBeNull();
  expect(checking.plaidItemId).not.toBeNull(); // new plaidItemId assigned

  // Verify old transaction data is still accessible via the same account ID
  const txns = await db
    .select()
    .from(transactions)
    .where(eq(transactions.accountId, oldCheckingId));
  expect(txns).toHaveLength(1);
  expect(txns[0].notes).toBe("user-edited-note");
});
```

You'll also need to add the `transactions` import from `@/db/schema`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/integration/plaid-exchange.test.ts`
Expected: FAIL — the checking account gets a new UUID instead of being resurrected.

- [ ] **Step 3: Implement match-or-create logic in `exchangeAndStoreAccounts`**

In `src/actions/plaid.ts`, add `isNull, isNotNull, desc` to the `drizzle-orm` import. Then replace the `for (const acct of plaidAccounts)` loop (lines 127-159) inside the transaction:

```typescript
for (const acct of plaidAccounts) {
  const currentBalance = plaidAmountToCents(acct.balances.current ?? null);
  const availableBalance = plaidAmountToCents(acct.balances.available ?? null);
  const creditLimit = plaidAmountToCents(acct.balances.limit ?? null);
  const accountType = mapPlaidAccountType(acct.type, acct.subtype ?? null);

  // Try to find a soft-deleted account with matching plaidAccountId
  const [existingDeleted] = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.plaidAccountId, acct.account_id),
        eq(accounts.householdId, householdId),
        isNotNull(accounts.deletedAt),
      ),
    )
    .orderBy(desc(accounts.deletedAt))
    .limit(1);

  let accountId: string;

  if (existingDeleted) {
    // Resurrect: reactivate the old account
    accountId = existingDeleted.id;
    await tx.update(accounts)
      .set({
        deletedAt: null,
        plaidItemId,
        name: acct.name,
        officialName: acct.official_name ?? null,
        type: accountType,
        subtype: acct.subtype ?? null,
        currentBalance,
        availableBalance,
        creditLimit,
        currency: acct.balances.iso_currency_code ?? "USD",
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, existingDeleted.id));
    console.log(`[plaid] Resurrected account ${accountId} (plaid: ${acct.account_id})`);
  } else {
    // Create new account
    accountId = uuid();
    await tx.insert(accounts)
      .values({
        id: accountId,
        householdId,
        plaidItemId,
        plaidAccountId: acct.account_id,
        name: acct.name,
        officialName: acct.official_name ?? null,
        type: accountType,
        subtype: acct.subtype ?? null,
        currentBalance,
        availableBalance,
        creditLimit,
        currency: acct.balances.iso_currency_code ?? "USD",
      });
    console.log(`[plaid] Created new account ${accountId} (plaid: ${acct.account_id})`);
  }

  if (currentBalance !== null) {
    await tx.insert(balanceHistory)
      .values({
        id: uuid(),
        accountId,
        date: today,
        balance: currentBalance,
      })
      .onConflictDoUpdate({
        target: [balanceHistory.accountId, balanceHistory.date],
        set: { balance: currentBalance },
      });
  }
}
```

Note: `isNotNull` and `desc` must be imported from `drizzle-orm`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/integration/plaid-exchange.test.ts`
Expected: PASS — all tests pass, including the new resurrection test.

- [ ] **Step 5: Write test for duplicate plaidAccountId edge case**

Add another test to `tests/integration/plaid-exchange.test.ts`:

```typescript
it("resurrects the most recently deleted account when duplicates exist", async () => {
  await setup();
  const hh = await provisionHousehold("user-dup-deleted", db);

  // Create two soft-deleted accounts with the same plaidAccountId
  const olderDate = new Date("2026-01-01");
  const newerDate = new Date("2026-05-01");

  const { accountId: olderId } = await insertSoftDeletedAccount(db, hh, {
    plaidAccountId: "plaid-acc-checking",
    name: "Older Checking",
    type: "checking",
    deletedAt: olderDate,
  });
  const { accountId: newerId } = await insertSoftDeletedAccount(db, hh, {
    plaidAccountId: "plaid-acc-checking",
    name: "Newer Checking",
    type: "checking",
    deletedAt: newerDate,
  });

  const result = await exchangeAndStoreAccounts("public-sandbox-token", hh, db);
  expect(result.success).toBe(true);

  // Should resurrect the most recently deleted one
  const allAccts = await db.select().from(accounts).where(eq(accounts.householdId, hh));
  const checking = allAccts.find(
    (a) => a.plaidAccountId === "plaid-acc-checking" && a.deletedAt === null,
  )!;
  expect(checking.id).toBe(newerId);

  // Older one should remain soft-deleted
  const older = allAccts.find((a) => a.id === olderId)!;
  expect(older.deletedAt).not.toBeNull();
});
```

- [ ] **Step 6: Run the full test suite for the file**

Run: `pnpm test tests/integration/plaid-exchange.test.ts`
Expected: PASS — all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/actions/plaid.ts tests/integration/plaid-exchange.test.ts
git commit -m "feat: resurrect soft-deleted accounts on re-link instead of creating new ones"
```

---

### Task 4: Add `isNull(deletedAt)` Filters to Transaction Sync

**Files:**
- Modify: `src/lib/plaid/sync.ts:255-263` (`applyToDb` account lookup)
- Modify: `src/lib/plaid/sync.ts:563-574` (`accountTypeMap` builder)

- [ ] **Step 1: Add `isNull` to the import in `sync.ts`**

The `isNull` import already exists at line 2. Verify it's there:

```typescript
import { eq, and, isNull } from "drizzle-orm";
```

- [ ] **Step 2: Fix the `applyToDb` account lookup query**

In `src/lib/plaid/sync.ts`, find the query at lines 255-263:

```typescript
// Before (lines 258-262)
.where(
  and(
    eq(accounts.householdId, householdId),
    eq(accounts.plaidItemId, itemId),
  ),
);

// After
.where(
  and(
    eq(accounts.householdId, householdId),
    eq(accounts.plaidItemId, itemId),
    isNull(accounts.deletedAt),
  ),
);
```

- [ ] **Step 3: Fix the `accountTypeMap` builder query**

In `src/lib/plaid/sync.ts`, find the query at lines 563-574:

```typescript
// Before (lines 569-573)
.where(
  and(
    eq(accounts.householdId, householdId),
    eq(accounts.plaidItemId, itemId),
  ),
);

// After
.where(
  and(
    eq(accounts.householdId, householdId),
    eq(accounts.plaidItemId, itemId),
    isNull(accounts.deletedAt),
  ),
);
```

- [ ] **Step 4: Run existing sync tests to verify no regressions**

Run: `pnpm test tests/integration/plaid-sync-is-transfer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/plaid/sync.ts
git commit -m "fix: filter deleted accounts from transaction sync queries"
```

---

### Task 5: One-Time Migration Script for Existing Orphans

**Files:**
- Create: `src/db/seed/migrate-orphaned-accounts.ts`

- [ ] **Step 1: Create the migration script**

Create `src/db/seed/migrate-orphaned-accounts.ts`:

```typescript
import { eq, and, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  transactions,
  investmentHoldings,
  holdingsHistory,
  investmentTransactions,
  balanceHistory,
  recurringTransactions,
} from "@/db/schema";

interface OrphanMatch {
  orphanId: string;
  activeId: string;
  orphanName: string;
  orphanType: string;
}

async function findOrphanMatches(): Promise<OrphanMatch[]> {
  // Find soft-deleted accounts that have a matching active account
  // by name + type + householdId
  const deletedAccts = await db
    .select({
      id: accounts.id,
      householdId: accounts.householdId,
      name: accounts.name,
      type: accounts.type,
    })
    .from(accounts)
    .where(isNotNull(accounts.deletedAt));

  const matches: OrphanMatch[] = [];

  for (const orphan of deletedAccts) {
    const candidates = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.householdId, orphan.householdId),
          eq(accounts.name, orphan.name),
          eq(accounts.type, orphan.type),
          isNull(accounts.deletedAt),
        ),
      );

    if (candidates.length === 1) {
      matches.push({
        orphanId: orphan.id,
        activeId: candidates[0].id,
        orphanName: orphan.name,
        orphanType: orphan.type,
      });
    } else if (candidates.length > 1) {
      console.log(`[skip] Ambiguous match for "${orphan.name}" (${orphan.type}): ${candidates.length} active candidates`);
    }
  }

  return matches;
}

async function migrateOrphan(match: OrphanMatch, dryRun: boolean): Promise<void> {
  const { orphanId, activeId, orphanName, orphanType } = match;
  console.log(`\n[migrate] "${orphanName}" (${orphanType}): ${orphanId} → ${activeId}`);

  if (dryRun) {
    // Count what would be moved
    const [txnCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(eq(transactions.accountId, orphanId));
    const [holdingCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(investmentHoldings)
      .where(eq(investmentHoldings.accountId, orphanId));
    const [balHistCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(balanceHistory)
      .where(eq(balanceHistory.accountId, orphanId));
    const [holdHistCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(holdingsHistory)
      .where(eq(holdingsHistory.accountId, orphanId));
    const [invTxnCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(investmentTransactions)
      .where(eq(investmentTransactions.accountId, orphanId));

    console.log(`  [dry-run] Would move: ${txnCount.count} transactions, ${holdingCount.count} holdings, ${balHistCount.count} balance history, ${holdHistCount.count} holdings history, ${invTxnCount.count} investment txns`);
    return;
  }

  await db.transaction(async (tx) => {
    // 1. Re-point transactions (splits cascade automatically)
    const txnResult = await tx
      .update(transactions)
      .set({ accountId: activeId })
      .where(eq(transactions.accountId, orphanId));
    console.log(`  transactions: ${txnResult.rowCount ?? 0} moved`);

    // 2. Re-point investment holdings
    const holdResult = await tx
      .update(investmentHoldings)
      .set({ accountId: activeId })
      .where(eq(investmentHoldings.accountId, orphanId));
    console.log(`  investmentHoldings: ${holdResult.rowCount ?? 0} moved`);

    // 3. Re-point investment transactions
    const invTxnResult = await tx
      .update(investmentTransactions)
      .set({ accountId: activeId })
      .where(eq(investmentTransactions.accountId, orphanId));
    console.log(`  investmentTransactions: ${invTxnResult.rowCount ?? 0} moved`);

    // 4. Balance history — delete conflicts first, then re-point
    await tx.execute(sql`
      DELETE FROM balance_history
      WHERE account_id = ${orphanId}
        AND (account_id, date) IN (
          SELECT ${orphanId}, date FROM balance_history WHERE account_id = ${activeId}
        )
    `);
    const balResult = await tx
      .update(balanceHistory)
      .set({ accountId: activeId })
      .where(eq(balanceHistory.accountId, orphanId));
    console.log(`  balanceHistory: ${balResult.rowCount ?? 0} moved`);

    // 5. Holdings history — delete conflicts first, then re-point
    await tx.execute(sql`
      DELETE FROM holdings_history
      WHERE account_id = ${orphanId}
        AND (account_id, plaid_security_id, date) IN (
          SELECT ${orphanId}, plaid_security_id, date FROM holdings_history WHERE account_id = ${activeId}
        )
    `);
    const holdHistResult = await tx
      .update(holdingsHistory)
      .set({ accountId: activeId })
      .where(eq(holdingsHistory.accountId, orphanId));
    console.log(`  holdingsHistory: ${holdHistResult.rowCount ?? 0} moved`);

    // 6. Recurring transactions
    const recResult = await tx
      .update(recurringTransactions)
      .set({ accountId: activeId })
      .where(eq(recurringTransactions.accountId, orphanId));
    console.log(`  recurringTransactions: ${recResult.rowCount ?? 0} moved`);

    // 7. Hard-delete the orphaned account
    await tx.delete(accounts).where(eq(accounts.id, orphanId));
    console.log(`  deleted orphan account ${orphanId}`);
  });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`\n=== Orphaned Account Migration ${dryRun ? "(DRY RUN)" : ""} ===\n`);

  const matches = await findOrphanMatches();

  if (matches.length === 0) {
    console.log("No orphaned accounts found.");
    return;
  }

  console.log(`Found ${matches.length} orphan → active matches:`);
  for (const m of matches) {
    console.log(`  "${m.orphanName}" (${m.orphanType}): ${m.orphanId} → ${m.activeId}`);
  }

  for (const match of matches) {
    await migrateOrphan(match, dryRun);
  }

  console.log(`\n=== Migration complete (${matches.length} accounts processed) ===\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify the script compiles**

Run: `pnpm typecheck`
Expected: PASS — no type errors from the new file.

- [ ] **Step 3: Commit**

```bash
git add src/db/seed/migrate-orphaned-accounts.ts
git commit -m "feat: add one-time migration script for orphaned accounts"
```

---

### Task 6: Run Full Test Suite and Verify

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: All tests pass. No regressions.

- [ ] **Step 2: Run type checking**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 3: Run linting**

Run: `pnpm lint`
Expected: No new lint errors.

- [ ] **Step 4: Run the migration script in dry-run mode against the dev database**

Run: `pnpm tsx src/db/seed/migrate-orphaned-accounts.ts --dry-run`
Expected: Script runs, reports any found orphan matches, and exits without making changes.

---
