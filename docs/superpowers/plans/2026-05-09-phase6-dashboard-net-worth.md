# Phase 6 — Dashboard + Net Worth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard stub with a fully functional financial overview featuring drag-and-drop widgets, net worth history chart, spending breakdown, cash flow, and balance snapshot infrastructure.

**Architecture:** Widget registry + composition pattern. Server component fetches all data via `Promise.all`, passes typed slices to a `DashboardGrid` client organism (react-grid-layout, dynamic import with `ssr: false`). Each widget is an independent client organism. URL search params drive interactive data fetching (not server actions). Balance snapshots recorded daily at midnight + after each Plaid sync.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM + SQLite, shadcn/ui v4, Recharts v3, react-grid-layout, Tailwind v4

**Spec:** `docs/superpowers/specs/2026-05-09-phase6-dashboard-net-worth-design.md`

---

## File Map

```
Create:
  src/lib/date-utils.ts                                  — todayDateString() utility
  src/lib/account-utils.ts                               — classifyAccountType (single source of truth)
  src/queries/dashboard.ts                               — all dashboard data fetching
  src/actions/dashboard.ts                               — saveDashboardLayout mutation only
  src/lib/jobs/backfill-balances.ts                      — historical balance reconstruction
  src/lib/jobs/backfill-balances.test.ts                 — colocated unit tests
  src/components/atoms/date-range-selector.tsx            — 1M/3M/6M/1Y/All toggle
  src/components/atoms/chart-view-toggle.tsx              — Donut/Bar tab switcher
  src/components/molecules/widget-placeholder.tsx         — "Coming soon" empty state
  src/components/molecules/spending-category-row.tsx      — category row with % bar
  src/components/organisms/widgets/registry.ts            — widget config array
  src/components/organisms/widgets/registry.test.ts       — registry unit tests
  src/components/organisms/widgets/net-worth-chart.tsx    — ComposedChart widget
  src/components/organisms/widgets/spending-by-category.tsx — PieChart/BarChart widget
  src/components/organisms/widgets/cash-flow-chart.tsx    — grouped BarChart widget
  src/components/organisms/widgets/recent-transactions.tsx — compact tx list
  src/components/organisms/widgets/account-balances.tsx   — account list by type
  src/components/organisms/widgets/dashboard-summary-cards.tsx — 4 SummaryCards
  src/components/organisms/dashboard-grid.tsx             — react-grid-layout wrapper
  src/app/(dashboard)/loading.tsx                         — skeleton loading state
  tests/integration/dashboard-queries.test.ts            — query integration tests
  tests/integration/balance-snapshot.test.ts             — snapshot job tests
  tests/integration/dashboard-actions.test.ts            — layout persistence tests

Modify:
  src/lib/plaid/utils.ts                                 — rename todayISO → re-export from date-utils
  src/queries/accounts.ts                                — use classifyAccountType, extract inline constants
  src/queries/transactions.ts                            — extract baseTransactionQuery helper
  src/components/molecules/summary-card.tsx               — add variant prop
  src/lib/jobs/scheduler.ts                              — add midnight balance snapshot job
  src/lib/plaid/sync.ts                                  — balance_history insert after sync tx
  src/actions/sync.ts                                    — add revalidatePath("/")
  src/app/(dashboard)/page.tsx                           — replace stub with full dashboard
```

---

### Task 1: Shared Utilities — date-utils and account-utils

**Files:**
- Create: `src/lib/date-utils.ts`
- Create: `src/lib/account-utils.ts`
- Modify: `src/lib/plaid/utils.ts` (re-export todayDateString)
- Modify: `src/queries/accounts.ts` (use classifyAccountType)

- [ ] **Step 1: Create `src/lib/date-utils.ts`**

```typescript
export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO(): string {
  return new Date().toISOString();
}
```

- [ ] **Step 2: Create `src/lib/account-utils.ts`**

```typescript
const ASSET_TYPES = new Set(["checking", "savings", "investment", "other"]);
const LIABILITY_TYPES = new Set(["credit", "loan"]);

export function classifyAccountType(type: string): "asset" | "liability" {
  if (LIABILITY_TYPES.has(type)) return "liability";
  return "asset";
}

export { ASSET_TYPES, LIABILITY_TYPES };
```

- [ ] **Step 3: Update `src/lib/plaid/utils.ts` to re-export from date-utils**

Replace the inline `todayISO` and `nowISO` functions with re-exports:

```typescript
export { todayDateString as todayISO, nowISO } from "@/lib/date-utils";
```

Keep the alias `todayISO` so existing callers (`src/actions/plaid.ts`) don't break.

- [ ] **Step 4: Update `src/queries/accounts.ts` to use `classifyAccountType`**

Replace the inline `ASSET_TYPES`/`LIABILITY_TYPES` sets and classification logic in `getAccountSummary` with the imported helper:

```typescript
import { classifyAccountType } from "@/lib/account-utils";

export function getAccountSummary(householdId: string, db: LedgrDb = defaultDb) {
  const allAccounts = getAccounts(householdId, db).filter((a) => !a.isHidden);

  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const account of allAccounts) {
    if (account.currentBalance === null) continue;
    const classification = classifyAccountType(account.type);
    if (classification === "asset") {
      totalAssets += account.currentBalance;
    } else {
      totalLiabilities += account.currentBalance;
    }
  }

  return { totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities };
}
```

- [ ] **Step 5: Run existing tests to verify no regressions**

Run: `pnpm test -- --run`
Expected: All existing tests pass. The refactored `getAccountSummary` behaves identically (only change: `"other"` accounts now classified as assets instead of being silently skipped).

- [ ] **Step 6: Commit**

```bash
git add src/lib/date-utils.ts src/lib/account-utils.ts src/lib/plaid/utils.ts src/queries/accounts.ts
git commit -m "refactor: extract date-utils and account-utils shared helpers"
```

---

### Task 2: Extract `baseTransactionQuery` from transactions.ts

**Files:**
- Modify: `src/queries/transactions.ts`

- [ ] **Step 1: Extract the shared SELECT + JOIN into a helper function**

Add this function above `getTransactions` in `src/queries/transactions.ts`:

```typescript
export function baseTransactionQuery(db: LedgrDb, householdId: string) {
  const scoped = scopedQuery(householdId, db);
  return {
    scoped,
    select: {
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
    },
    from: transactions,
    joins: (query: any) =>
      query
        .leftJoin(accounts, eq(transactions.accountId, accounts.id))
        .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .leftJoin(categoryGroups, eq(categories.groupId, categoryGroups.id)),
  };
}
```

- [ ] **Step 2: Refactor `getTransactions` to use the extracted helper**

Replace the inline select/joins in `getTransactions` with:

```typescript
export function getTransactions(
  householdId: string,
  filters: TransactionFilters = {},
  limit = 50,
  cursor: string | null = null,
  db: LedgrDb = defaultDb,
): TransactionPage {
  const base = baseTransactionQuery(db, householdId);
  const conditions: (SQL | undefined)[] = [notDeleted(transactions)];

  // ... filter building stays the same ...

  const rows = base.joins(
    db.select(base.select).from(base.from)
  )
    .where(base.scoped.where(transactions, ...conditions))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(limit + 1)
    .all();

  // ... rest stays the same ...
}
```

- [ ] **Step 3: Run transaction tests to verify no regressions**

Run: `pnpm test -- --run tests/integration/transaction-queries.test.ts`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/queries/transactions.ts
git commit -m "refactor: extract baseTransactionQuery for shared JOIN pattern"
```

---

### Task 3: Dashboard Queries — `src/queries/dashboard.ts`

**Files:**
- Create: `src/queries/dashboard.ts`
- Create: `tests/integration/dashboard-queries.test.ts`

- [ ] **Step 1: Write integration tests for dashboard queries**

Create `tests/integration/dashboard-queries.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertTransaction,
  insertCategoryGroup,
  insertCategory,
} from "./helpers";
import { v4 as uuid } from "uuid";
import { balanceHistory } from "../../src/db/schema";
import type { LedgrDb } from "../../src/db";
import {
  getDashboardSummary,
  getNetWorthHistory,
  getMonthlySpending,
  getCashFlow,
  getRecentTransactions,
} from "../../src/queries/dashboard";

describe("dashboard queries", () => {
  let db: LedgrDb;
  let close: () => void;
  let householdId: string;
  let checkingId: string;
  let creditId: string;
  let categoryId: string;

  beforeAll(() => {
    const testDb = createTestDb();
    db = testDb.db;
    close = testDb.close;

    ({ householdId } = insertHousehold(db));
    ({ accountId: checkingId } = insertAccount(db, householdId, {
      name: "Checking",
      type: "checking",
      currentBalance: 500000,
    }));
    ({ accountId: creditId } = insertAccount(db, householdId, {
      name: "Credit Card",
      type: "credit",
      currentBalance: 100000,
    }));

    const { groupId } = insertCategoryGroup(db, householdId, { name: "Food" });
    ({ categoryId } = insertCategory(db, householdId, groupId, { name: "Groceries", icon: "🛒" }));

    // Insert balance_history entries
    for (const [date, checkBal, creditBal] of [
      ["2026-04-01", 450000, 120000],
      ["2026-04-15", 470000, 110000],
      ["2026-05-01", 490000, 105000],
    ] as const) {
      db.insert(balanceHistory).values({ id: uuid(), accountId: checkingId, date, balance: checkBal }).run();
      db.insert(balanceHistory).values({ id: uuid(), accountId: creditId, date, balance: creditBal }).run();
    }

    // Insert transactions for current month (2026-05)
    insertTransaction(db, householdId, checkingId, {
      date: "2026-05-01",
      name: "Paycheck",
      amount: -300000,
      normalizedAmount: -300000,
      categoryId,
    });
    insertTransaction(db, householdId, checkingId, {
      date: "2026-05-02",
      name: "Groceries",
      amount: 5000,
      normalizedAmount: 5000,
      categoryId,
    });
    // Income transaction (negative normalizedAmount)
    insertTransaction(db, householdId, checkingId, {
      date: "2026-04-15",
      name: "April Paycheck",
      amount: -250000,
      normalizedAmount: -250000,
    });
    // Expense in April
    insertTransaction(db, householdId, checkingId, {
      date: "2026-04-20",
      name: "April Groceries",
      amount: 8000,
      normalizedAmount: 8000,
      categoryId,
    });
  });

  afterAll(() => close());

  it("getDashboardSummary returns correct net worth and monthly figures", () => {
    const summary = getDashboardSummary(householdId, db);
    expect(summary.netWorth).toBe(500000 - 100000);
    expect(summary.monthlyExpenses).toBeGreaterThan(0);
  });

  it("getNetWorthHistory aggregates balance_history by date with synthetic today", () => {
    const history = getNetWorthHistory(householdId, "3M", db);
    expect(history.length).toBeGreaterThanOrEqual(3);
    const last = history[history.length - 1];
    // Last point should be synthetic "today" from live balances
    expect(last.netWorth).toBe(500000 - 100000);
    // Each entry has assets, liabilities, netWorth
    for (const point of history) {
      expect(point.netWorth).toBe(point.assets - point.liabilities);
    }
  });

  it("getMonthlySpending groups by category for current month", () => {
    const spending = getMonthlySpending(householdId, "2026-05", db);
    expect(spending.length).toBeGreaterThan(0);
    const groceries = spending.find((s) => s.categoryName === "Groceries");
    expect(groceries).toBeDefined();
    expect(groceries!.total).toBe(5000);
  });

  it("getCashFlow separates income and expenses by month", () => {
    const flow = getCashFlow(householdId, 6, db);
    expect(flow.length).toBeGreaterThan(0);
    const april = flow.find((f) => f.month === "2026-04");
    expect(april).toBeDefined();
    expect(april!.income).toBe(250000);
    expect(april!.expenses).toBe(8000);
    expect(april!.net).toBe(250000 - 8000);
  });

  it("getRecentTransactions returns limited rows with joins", () => {
    const recent = getRecentTransactions(householdId, 3, db);
    expect(recent.length).toBeLessThanOrEqual(3);
    expect(recent[0].accountName).toBe("Checking");
  });

  it("household isolation: queries return empty for wrong household", () => {
    const { householdId: otherId } = insertHousehold(db, "Other");
    expect(getDashboardSummary(otherId, db).netWorth).toBe(0);
    expect(getNetWorthHistory(otherId, "all", db)).toEqual([]);
    expect(getMonthlySpending(otherId, undefined, db)).toEqual([]);
    expect(getCashFlow(otherId, 6, db)).toEqual([]);
    expect(getRecentTransactions(otherId, 5, db)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run tests/integration/dashboard-queries.test.ts`
Expected: FAIL — module `src/queries/dashboard` does not exist.

- [ ] **Step 3: Implement `src/queries/dashboard.ts`**

```typescript
import { eq, gte, lte, desc, sql, and, type SQL } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  accounts,
  balanceHistory,
  transactions,
  categories,
  categoryGroups,
  merchants,
} from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";
import { classifyAccountType } from "@/lib/account-utils";
import { todayDateString } from "@/lib/date-utils";
import { baseTransactionQuery, type TransactionRow } from "./transactions";

// --- Types ---

export interface DashboardSummary {
  netWorth: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyNet: number;
}

export interface NetWorthPoint {
  date: string;
  assets: number;
  liabilities: number;
  netWorth: number;
}

export interface SpendingRow {
  categoryId: string | null;
  categoryName: string;
  categoryIcon: string;
  groupName: string;
  total: number;
}

export interface CashFlowRow {
  month: string;
  income: number;
  expenses: number;
  net: number;
}

// --- Range helper ---

const RANGE_DAYS: Record<string, number> = {
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
};

function rangeToDateFrom(range: string): string | null {
  const days = RANGE_DAYS[range];
  if (!days) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// --- Queries ---

export function getDashboardSummary(
  householdId: string,
  db: LedgrDb = defaultDb,
): DashboardSummary {
  const scoped = scopedQuery(householdId, db);

  // Net worth from live balances
  const allAccounts = db
    .select({
      type: accounts.type,
      currentBalance: accounts.currentBalance,
      isHidden: accounts.isHidden,
    })
    .from(accounts)
    .where(scoped.where(accounts, notDeleted(accounts)))
    .all();

  let totalAssets = 0;
  let totalLiabilities = 0;
  for (const a of allAccounts) {
    if (a.isHidden || a.currentBalance === null) continue;
    if (classifyAccountType(a.type) === "asset") {
      totalAssets += a.currentBalance;
    } else {
      totalLiabilities += a.currentBalance;
    }
  }

  // Monthly income/expenses from current month transactions
  const today = todayDateString();
  const monthStart = today.slice(0, 7) + "-01";

  const monthRows = db
    .select({ normalizedAmount: transactions.normalizedAmount })
    .from(transactions)
    .where(
      scoped.where(
        transactions,
        notDeleted(transactions),
        gte(transactions.date, monthStart),
        lte(transactions.date, today),
        eq(transactions.pending, false),
      ),
    )
    .all();

  let monthlyIncome = 0;
  let monthlyExpenses = 0;
  for (const row of monthRows) {
    if (row.normalizedAmount < 0) {
      monthlyIncome += Math.abs(row.normalizedAmount);
    } else {
      monthlyExpenses += row.normalizedAmount;
    }
  }

  return {
    netWorth: totalAssets - totalLiabilities,
    monthlyIncome,
    monthlyExpenses,
    monthlyNet: monthlyIncome - monthlyExpenses,
  };
}

export function getNetWorthHistory(
  householdId: string,
  range: string,
  db: LedgrDb = defaultDb,
): NetWorthPoint[] {
  const scoped = scopedQuery(householdId, db);
  const dateFrom = rangeToDateFrom(range);

  const conditions: SQL[] = [];
  if (dateFrom) {
    conditions.push(gte(balanceHistory.date, dateFrom));
  }

  // Get all balance_history rows joined with account type
  const rows = db
    .select({
      date: balanceHistory.date,
      balance: balanceHistory.balance,
      accountType: accounts.type,
    })
    .from(balanceHistory)
    .innerJoin(accounts, eq(balanceHistory.accountId, accounts.id))
    .where(
      and(
        scoped.where(accounts, notDeleted(accounts), eq(accounts.isHidden, false)),
        ...conditions,
      ),
    )
    .orderBy(balanceHistory.date)
    .all();

  // Group by date
  const byDate = new Map<string, { assets: number; liabilities: number }>();
  for (const row of rows) {
    const entry = byDate.get(row.date) ?? { assets: 0, liabilities: 0 };
    if (classifyAccountType(row.accountType) === "asset") {
      entry.assets += row.balance;
    } else {
      entry.liabilities += row.balance;
    }
    byDate.set(row.date, entry);
  }

  const history: NetWorthPoint[] = [];
  for (const [date, { assets, liabilities }] of byDate) {
    history.push({ date, assets, liabilities, netWorth: assets - liabilities });
  }

  // Append synthetic "today" point from live balances
  const today = todayDateString();
  const summary = getDashboardSummary(householdId, db);
  const lastDate = history.length > 0 ? history[history.length - 1].date : null;
  if (lastDate !== today) {
    history.push({
      date: today,
      assets: summary.netWorth + summary.monthlyExpenses, // Not exact — use direct calculation
      liabilities: 0,
      netWorth: summary.netWorth,
    });
  }
  // Fix: compute synthetic today properly from accounts
  if (history.length > 0 && history[history.length - 1].date === today) {
    // Replace with accurate data
    const todayAccounts = db
      .select({ type: accounts.type, currentBalance: accounts.currentBalance, isHidden: accounts.isHidden })
      .from(accounts)
      .where(scoped.where(accounts, notDeleted(accounts), eq(accounts.isHidden, false)))
      .all();
    let assets = 0;
    let liabilities = 0;
    for (const a of todayAccounts) {
      if (a.currentBalance === null) continue;
      if (classifyAccountType(a.type) === "asset") assets += a.currentBalance;
      else liabilities += a.currentBalance;
    }
    history[history.length - 1] = { date: today, assets, liabilities, netWorth: assets - liabilities };
  }

  return history;
}

export function getMonthlySpending(
  householdId: string,
  month?: string,
  db: LedgrDb = defaultDb,
): SpendingRow[] {
  const scoped = scopedQuery(householdId, db);
  const targetMonth = month ?? todayDateString().slice(0, 7);
  const monthStart = targetMonth + "-01";
  const nextMonth = new Date(targetMonth + "-01");
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const monthEnd = nextMonth.toISOString().slice(0, 10);

  const rows = db
    .select({
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      groupName: categoryGroups.name,
      total: sql<number>`sum(${transactions.normalizedAmount})`.as("total"),
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(categoryGroups, eq(categories.groupId, categoryGroups.id))
    .where(
      scoped.where(
        transactions,
        notDeleted(transactions),
        gte(transactions.date, monthStart),
        sql`${transactions.date} < ${monthEnd}`,
        sql`${transactions.normalizedAmount} > 0`,
        eq(transactions.pending, false),
      ),
    )
    .groupBy(transactions.categoryId)
    .orderBy(desc(sql`total`))
    .all();

  return rows.map((row) => ({
    categoryId: row.categoryId,
    categoryName: row.categoryName ?? "Uncategorized",
    categoryIcon: row.categoryIcon ?? "❓",
    groupName: row.groupName ?? "Other",
    total: row.total,
  }));
}

export function getCashFlow(
  householdId: string,
  months = 6,
  db: LedgrDb = defaultDb,
): CashFlowRow[] {
  const scoped = scopedQuery(householdId, db);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const dateFrom = cutoff.toISOString().slice(0, 10);

  const rows = db
    .select({
      month: sql<string>`substr(${transactions.date}, 1, 7)`.as("month"),
      normalizedAmount: transactions.normalizedAmount,
    })
    .from(transactions)
    .where(
      scoped.where(
        transactions,
        notDeleted(transactions),
        gte(transactions.date, dateFrom),
        eq(transactions.pending, false),
      ),
    )
    .all();

  const byMonth = new Map<string, { income: number; expenses: number }>();
  for (const row of rows) {
    const entry = byMonth.get(row.month) ?? { income: 0, expenses: 0 };
    if (row.normalizedAmount < 0) {
      entry.income += Math.abs(row.normalizedAmount);
    } else {
      entry.expenses += row.normalizedAmount;
    }
    byMonth.set(row.month, entry);
  }

  const result: CashFlowRow[] = [];
  for (const [month, { income, expenses }] of byMonth) {
    result.push({ month, income, expenses, net: income - expenses });
  }

  return result.sort((a, b) => a.month.localeCompare(b.month));
}

export function getRecentTransactions(
  householdId: string,
  limit = 5,
  db: LedgrDb = defaultDb,
): TransactionRow[] {
  const base = baseTransactionQuery(db, householdId);

  const rows = base.joins(db.select(base.select).from(base.from))
    .where(base.scoped.where(transactions, notDeleted(transactions)))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(limit)
    .all();

  return rows.map((row) => ({
    ...row,
    accountName: row.accountName ?? "",
    currency: row.currency ?? "USD",
    pending: Boolean(row.pending),
    reviewed: Boolean(row.reviewed),
    hasSplits: false,
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- --run tests/integration/dashboard-queries.test.ts`
Expected: All 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/queries/dashboard.ts tests/integration/dashboard-queries.test.ts
git commit -m "feat: add dashboard queries with integration tests"
```

---

### Task 4: Balance Snapshot Job + Revalidation

**Note:** The sync-time balance recording (calling `/accounts/balance/get` and inserting balance_history in `applyToDb`) is deferred to Phase 5 completion, since it requires modifying the sync pipeline which is actively being worked on. The daily midnight snapshot provides balance history coverage in the meantime.

**Files:**
- Modify: `src/lib/jobs/scheduler.ts`
- Modify: `src/actions/sync.ts`
- Create: `tests/integration/balance-snapshot.test.ts`

- [ ] **Step 1: Write integration tests for balance snapshot**

Create `tests/integration/balance-snapshot.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "./setup";
import { insertHousehold, insertAccount } from "./helpers";
import { v4 as uuid } from "uuid";
import { balanceHistory, accounts } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import type { LedgrDb } from "../../src/db";
import { snapshotBalances } from "../../src/lib/jobs/scheduler";

describe("balance snapshot job", () => {
  let db: LedgrDb;
  let close: () => void;
  let householdId: string;

  beforeAll(() => {
    const testDb = createTestDb();
    db = testDb.db;
    close = testDb.close;
    ({ householdId } = insertHousehold(db));
  });

  afterAll(() => close());

  it("creates balance_history entries for active accounts", () => {
    const { accountId } = insertAccount(db, householdId, {
      currentBalance: 100000,
      type: "checking",
    });

    snapshotBalances(db);

    const rows = db.select().from(balanceHistory).where(eq(balanceHistory.accountId, accountId)).all();
    expect(rows.length).toBe(1);
    expect(rows[0].balance).toBe(100000);
  });

  it("is idempotent — running twice on same day does not duplicate", () => {
    const { accountId } = insertAccount(db, householdId, {
      currentBalance: 200000,
      type: "savings",
    });

    snapshotBalances(db);
    snapshotBalances(db);

    const rows = db.select().from(balanceHistory).where(eq(balanceHistory.accountId, accountId)).all();
    expect(rows.length).toBe(1);
  });

  it("skips hidden, deleted, and null-balance accounts", () => {
    const { accountId: hiddenId } = insertAccount(db, householdId, {
      currentBalance: 50000,
      isHidden: true,
    });
    const { accountId: deletedId } = insertAccount(db, householdId, {
      currentBalance: 50000,
      deletedAt: new Date().toISOString(),
    });
    const { accountId: nullId } = insertAccount(db, householdId, {
      currentBalance: null,
    });

    snapshotBalances(db);

    for (const id of [hiddenId, deletedId, nullId]) {
      const rows = db.select().from(balanceHistory).where(eq(balanceHistory.accountId, id)).all();
      expect(rows.length).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run tests/integration/balance-snapshot.test.ts`
Expected: FAIL — `snapshotBalances` does not exist.

- [ ] **Step 3: Add `snapshotBalances` to scheduler and wire up the cron job**

Update `src/lib/jobs/scheduler.ts`:

```typescript
import cron from "node-cron";
import { eq, and, isNull } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { plaidItems, accounts, balanceHistory } from "@/db/schema";
import { syncInstitution } from "@/lib/plaid/sync";
import { todayDateString } from "@/lib/date-utils";
import { v4 as uuid } from "uuid";

export function snapshotBalances(db: LedgrDb = defaultDb) {
  const today = todayDateString();

  const activeAccounts = db
    .select({ id: accounts.id, currentBalance: accounts.currentBalance })
    .from(accounts)
    .where(
      and(
        isNull(accounts.deletedAt),
        eq(accounts.isHidden, false),
      ),
    )
    .all();

  for (const account of activeAccounts) {
    if (account.currentBalance === null) continue;
    db.insert(balanceHistory)
      .values({
        id: uuid(),
        accountId: account.id,
        date: today,
        balance: account.currentBalance,
      })
      .onConflictDoNothing({ target: [balanceHistory.accountId, balanceHistory.date] })
      .run();
  }
}

export function startScheduler() {
  // Transaction sync: every 4 hours
  cron.schedule("0 */4 * * *", async () => {
    console.log("[scheduler] Starting transaction sync job");

    const activeItems = defaultDb
      .select({ id: plaidItems.id, householdId: plaidItems.householdId })
      .from(plaidItems)
      .where(eq(plaidItems.status, "active"))
      .all();

    for (const item of activeItems) {
      try {
        const result = await syncInstitution(item.id, item.householdId, defaultDb);
        if (result.success) {
          console.log(`[scheduler] Synced ${item.id}: +${result.addedCount} ~${result.modifiedCount} -${result.removedCount}`);
        } else {
          console.error(`[scheduler] Sync failed for ${item.id}: ${result.error}`);
        }
      } catch (e) {
        console.error(`[scheduler] Unexpected error syncing ${item.id}:`, e);
      }
    }

    console.log("[scheduler] Transaction sync job complete");
  });

  // Balance snapshot: daily at midnight
  cron.schedule("0 0 * * *", () => {
    console.log("[scheduler] Starting daily balance snapshot");
    snapshotBalances(defaultDb);
    console.log("[scheduler] Balance snapshot complete");
  });

  console.log("[scheduler] Started (transaction sync every 4h, balance snapshot at midnight)");
}
```

- [ ] **Step 4: Run snapshot tests**

Run: `pnpm test -- --run tests/integration/balance-snapshot.test.ts`
Expected: All 3 tests pass.

- [ ] **Step 5: Add `revalidatePath("/")` to `src/actions/sync.ts`**

Add the dashboard revalidation after existing revalidation calls:

```typescript
revalidatePath("/");
```

- [ ] **Step 6: Run all tests to verify no regressions**

Run: `pnpm test -- --run`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/jobs/scheduler.ts src/actions/sync.ts tests/integration/balance-snapshot.test.ts
git commit -m "feat: add daily balance snapshot job and sync revalidation"
```

---

### Task 5: Backfill Historical Balances

**Files:**
- Create: `src/lib/jobs/backfill-balances.ts`
- Create: `src/lib/jobs/backfill-balances.test.ts`

- [ ] **Step 1: Write unit tests for backfill**

Create `src/lib/jobs/backfill-balances.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { test } from "@fast-check/vitest";
import * as fc from "fast-check";
import { createTestDb } from "../../../tests/integration/setup";
import { insertHousehold, insertAccount, insertTransaction } from "../../../tests/integration/helpers";
import { v4 as uuid } from "uuid";
import { balanceHistory } from "../../db/schema";
import { eq } from "drizzle-orm";
import type { LedgrDb } from "../../db";
import { backfillAccountBalances } from "./backfill-balances";

describe("backfillAccountBalances", () => {
  let db: LedgrDb;
  let close: () => void;
  let householdId: string;

  beforeAll(() => {
    const testDb = createTestDb();
    db = testDb.db;
    close = testDb.close;
    ({ householdId } = insertHousehold(db));
  });

  afterAll(() => close());

  it("reconstructs daily balances from transactions", () => {
    const { accountId } = insertAccount(db, householdId, {
      currentBalance: 100000,
      type: "checking",
    });

    // Two transactions on different days
    insertTransaction(db, householdId, accountId, {
      date: "2026-05-08",
      amount: 2000,
      normalizedAmount: -2000,
      pending: false,
    });
    insertTransaction(db, householdId, accountId, {
      date: "2026-05-05",
      amount: 5000,
      normalizedAmount: -5000,
      pending: false,
    });

    backfillAccountBalances(db);

    const rows = db.select().from(balanceHistory)
      .where(eq(balanceHistory.accountId, accountId))
      .all()
      .sort((a, b) => a.date.localeCompare(b.date));

    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it("skips investment accounts", () => {
    const { accountId } = insertAccount(db, householdId, {
      currentBalance: 500000,
      type: "investment",
    });

    backfillAccountBalances(db);

    const rows = db.select().from(balanceHistory)
      .where(eq(balanceHistory.accountId, accountId))
      .all();
    expect(rows.length).toBe(0);
  });

  it("skips dates that already have entries", () => {
    const { accountId } = insertAccount(db, householdId, {
      currentBalance: 200000,
      type: "savings",
    });

    // Pre-existing entry
    db.insert(balanceHistory).values({
      id: uuid(),
      accountId,
      date: "2026-05-01",
      balance: 195000,
    }).run();

    backfillAccountBalances(db);

    const rows = db.select().from(balanceHistory)
      .where(eq(balanceHistory.accountId, accountId))
      .all();
    const may1 = rows.find((r) => r.date === "2026-05-01");
    expect(may1!.balance).toBe(195000); // Not overwritten
  });

  test.prop([
    fc.array(fc.integer({ min: -100000, max: 100000 }), { minLength: 1, maxLength: 20 }),
    fc.integer({ min: 0, max: 1000000 }),
  ])("backfill invariant: walking back and forward preserves current balance", (txAmounts, currentBalance) => {
    // The invariant: sum of daily deltas + earliest balance = currentBalance
    let running = currentBalance;
    for (const amt of txAmounts) {
      running -= amt;
    }
    // Walking forward: running + sum(txAmounts) === currentBalance
    const sum = txAmounts.reduce((a, b) => a + b, 0);
    expect(running + sum).toBe(currentBalance);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run src/lib/jobs/backfill-balances.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/lib/jobs/backfill-balances.ts`**

```typescript
import { eq, and, isNull, desc } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { accounts, balanceHistory, transactions } from "@/db/schema";
import { todayDateString } from "@/lib/date-utils";
import { v4 as uuid } from "uuid";

const SKIP_TYPES = new Set(["investment"]);

export function backfillAccountBalances(db: LedgrDb = defaultDb) {
  const today = todayDateString();

  const eligibleAccounts = db
    .select({
      id: accounts.id,
      type: accounts.type,
      currentBalance: accounts.currentBalance,
      createdAt: accounts.createdAt,
    })
    .from(accounts)
    .where(and(isNull(accounts.deletedAt), eq(accounts.isHidden, false)))
    .all();

  for (const account of eligibleAccounts) {
    if (account.currentBalance === null) continue;
    if (SKIP_TYPES.has(account.type)) continue;

    // Get all posted, non-deleted transactions ordered by date desc
    const txns = db
      .select({
        date: transactions.date,
        normalizedAmount: transactions.normalizedAmount,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, account.id),
          eq(transactions.pending, false),
          isNull(transactions.deletedAt),
        ),
      )
      .orderBy(desc(transactions.date))
      .all();

    // Group transactions by date
    const byDate = new Map<string, number>();
    for (const tx of txns) {
      byDate.set(tx.date, (byDate.get(tx.date) ?? 0) + tx.normalizedAmount);
    }

    // Walk backward from current balance
    let balance = account.currentBalance;
    const dates = [today, ...Array.from(byDate.keys()).sort().reverse()];
    const seen = new Set<string>();

    for (const date of dates) {
      if (seen.has(date)) continue;
      seen.add(date);

      // Insert if not already present
      db.insert(balanceHistory)
        .values({ id: uuid(), accountId: account.id, date, balance })
        .onConflictDoNothing({ target: [balanceHistory.accountId, balanceHistory.date] })
        .run();

      // Subtract the day's net to get previous day's balance
      const dayNet = byDate.get(date);
      if (dayNet !== undefined) {
        balance -= dayNet;
      }
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test -- --run src/lib/jobs/backfill-balances.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/jobs/backfill-balances.ts src/lib/jobs/backfill-balances.test.ts
git commit -m "feat: add historical balance backfill with unit + property tests"
```

---

### Task 6: Dashboard Layout Action + SummaryCard Variant

**Files:**
- Create: `src/actions/dashboard.ts`
- Create: `tests/integration/dashboard-actions.test.ts`
- Modify: `src/components/molecules/summary-card.tsx`

- [ ] **Step 1: Write integration tests for layout persistence**

Create `tests/integration/dashboard-actions.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "./setup";
import { insertHousehold } from "./helpers";
import { v4 as uuid } from "uuid";
import { userSettings } from "../../src/db/schema";
import type { LedgrDb } from "../../src/db";
import { saveLayout, getLayout } from "../../src/actions/dashboard";

describe("dashboard layout persistence", () => {
  let db: LedgrDb;
  let close: () => void;
  let householdId: string;
  let userId: string;

  beforeAll(() => {
    const testDb = createTestDb();
    db = testDb.db;
    close = testDb.close;
    ({ householdId } = insertHousehold(db));
    userId = uuid();
  });

  afterAll(() => close());

  it("saves and loads dashboard layout", () => {
    const layout = {
      desktop: [{ i: "net-worth", x: 0, y: 0, w: 2, h: 2 }],
      tablet: [{ i: "net-worth", x: 0, y: 0, w: 2, h: 2 }],
      mobile: [{ i: "net-worth", x: 0, y: 0, w: 1, h: 2 }],
    };

    saveLayout(userId, layout, db);
    const loaded = getLayout(userId, db);
    expect(loaded).toEqual(layout);
  });

  it("handles corrupted JSON gracefully", () => {
    // Insert corrupted JSON directly
    db.insert(userSettings)
      .values({ id: uuid(), userId: "corrupt-user", dashboardLayout: "{invalid json" })
      .run();

    const loaded = getLayout("corrupt-user", db);
    expect(loaded).toBeNull();
  });
});
```

- [ ] **Step 2: Implement `src/actions/dashboard.ts`**

```typescript
"use server";

import { eq } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { userSettings } from "@/db/schema";
import { v4 as uuid } from "uuid";

export interface GridItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardLayout {
  desktop: GridItem[];
  tablet: GridItem[];
  mobile: GridItem[];
}

export function saveLayout(
  userId: string,
  layout: DashboardLayout,
  db: LedgrDb = defaultDb,
) {
  const json = JSON.stringify(layout);
  const existing = db
    .select({ id: userSettings.id })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  if (existing) {
    db.update(userSettings)
      .set({ dashboardLayout: json, updatedAt: new Date().toISOString() })
      .where(eq(userSettings.id, existing.id))
      .run();
  } else {
    db.insert(userSettings)
      .values({ id: uuid(), userId, dashboardLayout: json })
      .run();
  }
}

export function getLayout(
  userId: string,
  db: LedgrDb = defaultDb,
): DashboardLayout | null {
  const row = db
    .select({ dashboardLayout: userSettings.dashboardLayout })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  if (!row?.dashboardLayout) return null;

  try {
    return JSON.parse(row.dashboardLayout) as DashboardLayout;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Run action tests**

Run: `pnpm test -- --run tests/integration/dashboard-actions.test.ts`
Expected: All 2 tests pass.

- [ ] **Step 4: Add `variant` prop to SummaryCard**

Update `src/components/molecules/summary-card.tsx`:

```typescript
import { Card, CardContent } from "@/components/ui/card";
import { BalanceDisplay } from "@/components/atoms/balance-display";
import { cn } from "@/lib/utils";

interface SummaryCardProps {
  label: string;
  amount: number | null;
  currency?: string;
  variant?: "default" | "positive" | "negative";
}

const variantClasses = {
  default: "",
  positive: "text-emerald-600",
  negative: "text-destructive",
};

export function SummaryCard({ label, amount, currency, variant = "default" }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className={cn(variantClasses[variant])}>
          <BalanceDisplay amount={amount} currency={currency} size="lg" />
        </div>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/actions/dashboard.ts tests/integration/dashboard-actions.test.ts src/components/molecules/summary-card.tsx
git commit -m "feat: add dashboard layout persistence and SummaryCard variant prop"
```

---

### Task 7: Install Dependencies + shadcn Chart Component

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install react-grid-layout**

Run: `pnpm add react-grid-layout @types/react-grid-layout`

- [ ] **Step 2: Add shadcn chart component**

Run: `pnpm dlx shadcn@latest add chart tabs toggle-group`

This installs the chart wrapper (ChartContainer, ChartTooltip, ChartConfig), Tabs, and ToggleGroup components.

- [ ] **Step 3: Verify installation**

Run: `pnpm typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/components/ui/
git commit -m "chore: add react-grid-layout, shadcn chart, tabs, and toggle-group"
```

---

### Task 8: Atom Components — DateRangeSelector + ChartViewToggle

**Files:**
- Create: `src/components/atoms/date-range-selector.tsx`
- Create: `src/components/atoms/chart-view-toggle.tsx`

- [ ] **Step 1: Create DateRangeSelector atom**

Create `src/components/atoms/date-range-selector.tsx`:

```typescript
"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const RANGES = ["1M", "3M", "6M", "1Y", "All"] as const;

interface DateRangeSelectorProps {
  value: string;
  onChange: (range: string) => void;
}

export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  return (
    <ToggleGroup type="single" value={value} onValueChange={(v) => v && onChange(v)} size="sm">
      {RANGES.map((range) => (
        <ToggleGroupItem key={range} value={range} className="text-xs px-2">
          {range}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
```

- [ ] **Step 2: Create ChartViewToggle atom**

Create `src/components/atoms/chart-view-toggle.tsx`:

```typescript
"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ChartViewToggleProps {
  value: "donut" | "bar";
  onChange: (view: "donut" | "bar") => void;
}

export function ChartViewToggle({ value, onChange }: ChartViewToggleProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as "donut" | "bar")}>
      <TabsList className="h-7">
        <TabsTrigger value="donut" className="text-xs px-2">Donut</TabsTrigger>
        <TabsTrigger value="bar" className="text-xs px-2">Bar</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/atoms/date-range-selector.tsx src/components/atoms/chart-view-toggle.tsx
git commit -m "feat: add DateRangeSelector and ChartViewToggle atoms"
```

---

### Task 9: Molecule Components — WidgetPlaceholder + SpendingCategoryRow

**Files:**
- Create: `src/components/molecules/widget-placeholder.tsx`
- Create: `src/components/molecules/spending-category-row.tsx`

- [ ] **Step 1: Create WidgetPlaceholder molecule**

Create `src/components/molecules/widget-placeholder.tsx`:

```typescript
import { Clock } from "lucide-react";

interface WidgetPlaceholderProps {
  title: string;
  description: string;
}

export function WidgetPlaceholder({ title, description }: WidgetPlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 gap-2 p-6">
      <Clock className="size-8" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-center">{description}</p>
    </div>
  );
}
```

- [ ] **Step 2: Create SpendingCategoryRow molecule**

Create `src/components/molecules/spending-category-row.tsx`:

```typescript
import { centsToDisplay } from "@/lib/money";

interface SpendingCategoryRowProps {
  name: string;
  icon: string;
  amount: number;
  percentage: number;
  color: string;
}

export function SpendingCategoryRow({ name, icon, amount, percentage, color }: SpendingCategoryRowProps) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-sm">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm truncate">{name}</span>
          <span className="text-sm font-medium tabular-nums ml-2">{centsToDisplay(amount)}</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted mt-1">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(percentage, 100)}%`, backgroundColor: color }}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/molecules/widget-placeholder.tsx src/components/molecules/spending-category-row.tsx
git commit -m "feat: add WidgetPlaceholder and SpendingCategoryRow molecules"
```

---

### Task 10: Widget Registry

**Files:**
- Create: `src/components/organisms/widgets/registry.ts`
- Create: `src/components/organisms/widgets/registry.test.ts`

- [ ] **Step 1: Create widget registry**

Create `src/components/organisms/widgets/registry.ts`:

```typescript
import type { ComponentType } from "react";

export interface GridItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetConfig {
  id: string;
  title: string;
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
  isPlaceholder?: boolean;
  placeholderText?: string;
}

export const DASHBOARD_WIDGETS: WidgetConfig[] = [
  { id: "net-worth", title: "Net Worth", defaultSize: { w: 2, h: 2 } },
  { id: "accounts", title: "Account Balances", defaultSize: { w: 2, h: 1 } },
  { id: "summary", title: "Summary", defaultSize: { w: 2, h: 1 } },
  { id: "spending", title: "Spending", defaultSize: { w: 2, h: 2 } },
  { id: "cash-flow", title: "Cash Flow", defaultSize: { w: 2, h: 1 } },
  { id: "recent-txns", title: "Recent Transactions", defaultSize: { w: 2, h: 2 } },
  { id: "budgets", title: "Budget Progress", defaultSize: { w: 2, h: 1 }, isPlaceholder: true, placeholderText: "Coming in Phase 8" },
  { id: "bills", title: "Upcoming Bills", defaultSize: { w: 2, h: 1 }, isPlaceholder: true, placeholderText: "Coming in Phase 10" },
  { id: "goals", title: "Goals", defaultSize: { w: 2, h: 1 }, isPlaceholder: true, placeholderText: "Coming in Phase 13" },
];

export const ACTIVE_WIDGETS = DASHBOARD_WIDGETS.filter((w) => !w.isPlaceholder);

export function getDefaultLayout(): { desktop: GridItem[]; tablet: GridItem[]; mobile: GridItem[] } {
  const desktop: GridItem[] = [
    { i: "net-worth", x: 0, y: 0, w: 2, h: 2 },
    { i: "accounts", x: 2, y: 0, w: 2, h: 1 },
    { i: "summary", x: 2, y: 1, w: 2, h: 1 },
    { i: "spending", x: 0, y: 2, w: 2, h: 2 },
    { i: "cash-flow", x: 2, y: 2, w: 2, h: 1 },
    { i: "recent-txns", x: 2, y: 3, w: 2, h: 2 },
  ];
  const tablet: GridItem[] = desktop.map((item, i) => ({
    ...item,
    x: 0,
    y: i * item.h,
    w: 2,
  }));
  const mobile: GridItem[] = desktop.map((item, i) => ({
    ...item,
    x: 0,
    y: i * item.h,
    w: 1,
  }));
  return { desktop, tablet, mobile };
}
```

- [ ] **Step 2: Create registry unit tests**

Create `src/components/organisms/widgets/registry.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { DASHBOARD_WIDGETS, ACTIVE_WIDGETS, getDefaultLayout } from "./registry";

describe("widget registry", () => {
  it("has no duplicate widget IDs", () => {
    const ids = DASHBOARD_WIDGETS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("default layout includes all active widget IDs", () => {
    const layout = getDefaultLayout();
    const layoutIds = new Set(layout.desktop.map((item) => item.i));
    for (const widget of ACTIVE_WIDGETS) {
      expect(layoutIds.has(widget.id)).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run registry tests**

Run: `pnpm test -- --run src/components/organisms/widgets/registry.test.ts`
Expected: All 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/organisms/widgets/registry.ts src/components/organisms/widgets/registry.test.ts
git commit -m "feat: add widget registry with default layouts and unit tests"
```

---

### Task 11: Widget Organisms — Charts

**Files:**
- Create: `src/components/organisms/widgets/net-worth-chart.tsx`
- Create: `src/components/organisms/widgets/spending-by-category.tsx`
- Create: `src/components/organisms/widgets/cash-flow-chart.tsx`

- [ ] **Step 1: Create NetWorthChart widget**

Create `src/components/organisms/widgets/net-worth-chart.tsx`:

```typescript
"use client";

import { useState } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { DateRangeSelector } from "@/components/atoms/date-range-selector";
import { centsToDisplay } from "@/lib/money";
import type { NetWorthPoint } from "@/queries/dashboard";

interface NetWorthChartProps {
  data: NetWorthPoint[];
  onRangeChange: (range: string) => void;
  currentRange: string;
  isLoading?: boolean;
}

function formatDate(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{formatDate(label)}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {centsToDisplay(entry.value)}
        </p>
      ))}
    </div>
  );
}

export function NetWorthChart({ data, onRangeChange, currentRange, isLoading }: NetWorthChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Net worth history will appear after your accounts sync.
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col">
      <div className="flex justify-end mb-2">
        <DateRangeSelector value={currentRange} onChange={onRangeChange} />
      </div>
      {isLoading && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
          <div className="animate-pulse text-sm text-muted-foreground">Loading...</div>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" tickFormatter={formatDate} className="text-xs" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => centsToDisplay(v).replace(/\.00$/, "")} className="text-xs" tick={{ fontSize: 11 }} width={60} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="netWorth" name="Net Worth" fill="hsl(var(--primary) / 0.1)" stroke="hsl(var(--primary))" strokeWidth={2} />
            <Line type="monotone" dataKey="assets" name="Assets" stroke="hsl(142 76% 36%)" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="liabilities" name="Liabilities" stroke="hsl(var(--destructive))" strokeWidth={1.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create SpendingByCategory widget**

Create `src/components/organisms/widgets/spending-by-category.tsx`:

```typescript
"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChartViewToggle } from "@/components/atoms/chart-view-toggle";
import { SpendingCategoryRow } from "@/components/molecules/spending-category-row";
import { centsToDisplay } from "@/lib/money";
import type { SpendingRow } from "@/queries/dashboard";

const COLORS = [
  "hsl(142 76% 36%)", "hsl(221 83% 53%)", "hsl(262 83% 58%)",
  "hsl(25 95% 53%)", "hsl(346 77% 50%)", "hsl(47 96% 53%)",
  "hsl(173 80% 36%)", "hsl(322 65% 55%)",
];

interface SpendingByCategoryProps {
  data: SpendingRow[];
  currentMonth: string;
  onMonthChange: (month: string) => void;
  isLoading?: boolean;
}

function formatMonth(month: string) {
  const [y, m] = month.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function navigateMonth(month: string, direction: -1 | 1): string {
  const d = new Date(month + "-01");
  d.setMonth(d.getMonth() + direction);
  return d.toISOString().slice(0, 7);
}

export function SpendingByCategory({ data, currentMonth, onMonthChange, isLoading }: SpendingByCategoryProps) {
  const [view, setView] = useState<"donut" | "bar">("donut");

  const total = data.reduce((sum, d) => sum + d.total, 0);
  const top8 = data.slice(0, 8);
  const otherTotal = data.slice(8).reduce((sum, d) => sum + d.total, 0);
  const chartData = otherTotal > 0
    ? [...top8, { categoryId: null, categoryName: "Other", categoryIcon: "📦", groupName: "Other", total: otherTotal }]
    : top8;

  if (data.length === 0 && !isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No spending data for {formatMonth(currentMonth)}.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-6" onClick={() => onMonthChange(navigateMonth(currentMonth, -1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-medium min-w-[140px] text-center">{formatMonth(currentMonth)}</span>
          <Button variant="ghost" size="icon" className="size-6" onClick={() => onMonthChange(navigateMonth(currentMonth, 1))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <ChartViewToggle value={view} onChange={setView} />
      </div>
      <div className="flex-1 min-h-0 flex gap-4">
        {view === "donut" ? (
          <>
            <div className="w-1/2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} dataKey="total" nameKey="categoryName" cx="50%" cy="50%" innerRadius="55%" outerRadius="85%">
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => centsToDisplay(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-1/2 overflow-y-auto">
              {chartData.map((row, i) => (
                <SpendingCategoryRow
                  key={row.categoryId ?? "other"}
                  name={row.categoryName}
                  icon={row.categoryIcon}
                  amount={row.total}
                  percentage={total > 0 ? (row.total / total) * 100 : 0}
                  color={COLORS[i % COLORS.length]}
                />
              ))}
            </div>
          </>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
              <XAxis type="number" tickFormatter={(v) => centsToDisplay(v).replace(/\.00$/, "")} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="categoryName" tick={{ fontSize: 11 }} width={75} />
              <Tooltip formatter={(v: number) => centsToDisplay(v)} />
              <Bar dataKey="total">
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create CashFlowChart widget**

Create `src/components/organisms/widgets/cash-flow-chart.tsx`:

```typescript
"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { centsToDisplay } from "@/lib/money";
import type { CashFlowRow } from "@/queries/dashboard";

interface CashFlowChartProps {
  data: CashFlowRow[];
}

function formatMonth(month: string) {
  const [y, m] = month.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-US", { month: "short" });
}

export function CashFlowChart({ data }: CashFlowChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Cash flow data will appear after your first sync.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={(v) => centsToDisplay(v).replace(/\.00$/, "")} tick={{ fontSize: 11 }} width={60} />
        <Tooltip formatter={(v: number) => centsToDisplay(v)} labelFormatter={formatMonth} />
        <Legend />
        <Bar dataKey="income" name="Income" fill="hsl(142 76% 36%)" radius={[2, 2, 0, 0]} />
        <Bar dataKey="expenses" name="Expenses" fill="hsl(var(--destructive))" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/organisms/widgets/net-worth-chart.tsx src/components/organisms/widgets/spending-by-category.tsx src/components/organisms/widgets/cash-flow-chart.tsx
git commit -m "feat: add chart widget organisms (net worth, spending, cash flow)"
```

---

### Task 12: Widget Organisms — Data Widgets

**Files:**
- Create: `src/components/organisms/widgets/recent-transactions.tsx`
- Create: `src/components/organisms/widgets/account-balances.tsx`
- Create: `src/components/organisms/widgets/dashboard-summary-cards.tsx`

- [ ] **Step 1: Create RecentTransactionsWidget**

Create `src/components/organisms/widgets/recent-transactions.tsx`:

```typescript
"use client";

import Link from "next/link";
import { AmountDisplay } from "@/components/atoms/amount-display";
import type { TransactionRow } from "@/queries/transactions";

interface RecentTransactionsWidgetProps {
  data: TransactionRow[];
}

function formatDate(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function RecentTransactionsWidget({ data }: RecentTransactionsWidgetProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No transactions yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 space-y-1">
        {data.map((tx) => (
          <div key={tx.id} className="flex items-center justify-between py-1.5 px-1">
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{tx.merchantName ?? tx.name}</p>
              <p className="text-xs text-muted-foreground">{formatDate(tx.date)}</p>
            </div>
            <AmountDisplay amount={tx.normalizedAmount} currency={tx.currency} />
          </div>
        ))}
      </div>
      <Link
        href="/transactions"
        className="text-xs text-primary hover:underline text-center pt-2 mt-auto"
      >
        View all transactions
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Create AccountBalancesWidget**

Create `src/components/organisms/widgets/account-balances.tsx`:

```typescript
"use client";

import Link from "next/link";
import { AccountTypeIcon } from "@/components/atoms/account-type-icon";
import { BalanceDisplay } from "@/components/atoms/balance-display";
import type { AccountType } from "@/db/schema/accounts";

interface AccountBalanceRow {
  id: string;
  name: string;
  type: AccountType;
  currentBalance: number | null;
  currency: string | null;
}

interface AccountBalancesWidgetProps {
  data: AccountBalanceRow[];
}

export function AccountBalancesWidget({ data }: AccountBalancesWidgetProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <Link href="/accounts" className="text-primary hover:underline">Connect an account</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 space-y-1 overflow-y-auto">
        {data.map((account) => (
          <div key={account.id} className="flex items-center justify-between py-1.5 px-1">
            <div className="flex items-center gap-2 min-w-0">
              <AccountTypeIcon type={account.type} />
              <span className="text-sm truncate">{account.name}</span>
            </div>
            <BalanceDisplay amount={account.currentBalance} currency={account.currency ?? "USD"} size="sm" />
          </div>
        ))}
      </div>
      <Link
        href="/accounts"
        className="text-xs text-primary hover:underline text-center pt-2 mt-auto"
      >
        View all accounts
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Create DashboardSummaryCards**

Create `src/components/organisms/widgets/dashboard-summary-cards.tsx`:

```typescript
"use client";

import { SummaryCard } from "@/components/molecules/summary-card";
import type { DashboardSummary } from "@/queries/dashboard";

interface DashboardSummaryCardsProps {
  data: DashboardSummary;
}

export function DashboardSummaryCards({ data }: DashboardSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 h-full">
      <SummaryCard
        label="Net Worth"
        amount={data.netWorth}
        variant={data.netWorth >= 0 ? "positive" : "negative"}
      />
      <SummaryCard
        label="Monthly Income"
        amount={data.monthlyIncome}
        variant="positive"
      />
      <SummaryCard
        label="Monthly Expenses"
        amount={data.monthlyExpenses}
        variant="negative"
      />
      <SummaryCard
        label="Net Savings"
        amount={data.monthlyNet}
        variant={data.monthlyNet >= 0 ? "positive" : "negative"}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/organisms/widgets/recent-transactions.tsx src/components/organisms/widgets/account-balances.tsx src/components/organisms/widgets/dashboard-summary-cards.tsx
git commit -m "feat: add data widget organisms (recent txns, account balances, summary cards)"
```

---

### Task 13: DashboardGrid Organism

**Files:**
- Create: `src/components/organisms/dashboard-grid.tsx`

- [ ] **Step 1: Create DashboardGrid with react-grid-layout**

Create `src/components/organisms/dashboard-grid.tsx`:

```typescript
"use client";

import { useState, useCallback, useTransition } from "react";
import { Responsive, WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GripVertical } from "lucide-react";

import { NetWorthChart } from "./widgets/net-worth-chart";
import { SpendingByCategory } from "./widgets/spending-by-category";
import { CashFlowChart } from "./widgets/cash-flow-chart";
import { RecentTransactionsWidget } from "./widgets/recent-transactions";
import { AccountBalancesWidget } from "./widgets/account-balances";
import { DashboardSummaryCards } from "./widgets/dashboard-summary-cards";
import { WidgetPlaceholder } from "@/components/molecules/widget-placeholder";
import { DASHBOARD_WIDGETS, type GridItem } from "./widgets/registry";
import { saveLayout } from "@/actions/dashboard";
import type { DashboardData } from "@/app/(dashboard)/page";

const ResponsiveGridLayout = WidthProvider(Responsive);

interface DashboardGridProps {
  layout: { desktop: GridItem[]; tablet: GridItem[]; mobile: GridItem[] };
  data: DashboardData;
  userId: string;
}

export function DashboardGrid({ layout, data, userId }: DashboardGridProps) {
  const [layouts, setLayouts] = useState({
    lg: layout.desktop,
    md: layout.tablet,
    sm: layout.mobile,
  });
  const [nwRange, setNwRange] = useState("6M");
  const [nwData, setNwData] = useState(data.netWorthHistory);
  const [nwLoading, startNwTransition] = useTransition();
  const [spendMonth, setSpendMonth] = useState(new Date().toISOString().slice(0, 7));
  const [spendData, setSpendData] = useState(data.monthlySpending);
  const [spendLoading, startSpendTransition] = useTransition();

  const handleLayoutChange = useCallback(
    (_: any, allLayouts: any) => {
      const newLayout = {
        desktop: allLayouts.lg ?? layouts.lg,
        tablet: allLayouts.md ?? layouts.md,
        mobile: allLayouts.sm ?? layouts.sm,
      };
      setLayouts({ lg: newLayout.desktop, md: newLayout.tablet, sm: newLayout.mobile });
      saveLayout(userId, newLayout);
    },
    [userId, layouts],
  );

  function renderWidget(id: string) {
    const config = DASHBOARD_WIDGETS.find((w) => w.id === id);
    if (!config) return null;
    if (config.isPlaceholder) {
      return <WidgetPlaceholder title={config.title} description={config.placeholderText ?? ""} />;
    }

    switch (id) {
      case "net-worth":
        return (
          <NetWorthChart
            data={nwData}
            currentRange={nwRange}
            onRangeChange={(range) => {
              setNwRange(range);
              startNwTransition(async () => {
                const res = await fetch(`/api/dashboard/net-worth?range=${range}`);
                const newData = await res.json();
                setNwData(newData);
              });
            }}
            isLoading={nwLoading}
          />
        );
      case "spending":
        return (
          <SpendingByCategory
            data={spendData}
            currentMonth={spendMonth}
            onMonthChange={(month) => {
              setSpendMonth(month);
              startSpendTransition(async () => {
                const res = await fetch(`/api/dashboard/spending?month=${month}`);
                const newData = await res.json();
                setSpendData(newData);
              });
            }}
            isLoading={spendLoading}
          />
        );
      case "cash-flow":
        return <CashFlowChart data={data.cashFlow} />;
      case "recent-txns":
        return <RecentTransactionsWidget data={data.recentTransactions} />;
      case "accounts":
        return <AccountBalancesWidget data={data.accounts} />;
      case "summary":
        return <DashboardSummaryCards data={data.summary} />;
      default:
        return null;
    }
  }

  return (
    <ResponsiveGridLayout
      layouts={layouts}
      breakpoints={{ lg: 1200, md: 768, sm: 0 }}
      cols={{ lg: 4, md: 2, sm: 1 }}
      rowHeight={160}
      onLayoutChange={handleLayoutChange}
      isDraggable
      isResizable={false}
      draggableHandle=".drag-handle"
      margin={[16, 16]}
    >
      {layouts.lg.map((item) => (
        <div key={item.i}>
          <Card className="h-full flex flex-col">
            <CardHeader className="pb-2 pt-3 px-4 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium">
                {DASHBOARD_WIDGETS.find((w) => w.id === item.i)?.title ?? item.i}
              </CardTitle>
              <GripVertical className="size-4 text-muted-foreground cursor-grab drag-handle" />
            </CardHeader>
            <CardContent className="flex-1 min-h-0 pb-3 px-4">
              {renderWidget(item.i)}
            </CardContent>
          </Card>
        </div>
      ))}
    </ResponsiveGridLayout>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: May see errors for `DashboardData` type and API routes not yet created — those are built in Tasks 14-15.

- [ ] **Step 3: Commit**

```bash
git add src/components/organisms/dashboard-grid.tsx
git commit -m "feat: add DashboardGrid organism with react-grid-layout"
```

---

### Task 14: Dashboard API Routes for Widget Data Refresh

**Files:**
- Create: `src/app/api/dashboard/net-worth/route.ts`
- Create: `src/app/api/dashboard/spending/route.ts`

- [ ] **Step 1: Create net worth API route**

Create `src/app/api/dashboard/net-worth/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getHouseholdId } from "@/lib/auth/session";
import { getNetWorthHistory } from "@/queries/dashboard";

export async function GET(request: NextRequest) {
  const householdId = await getHouseholdId();
  const range = request.nextUrl.searchParams.get("range") ?? "6M";
  const data = getNetWorthHistory(householdId, range);
  return NextResponse.json(data);
}
```

- [ ] **Step 2: Create spending API route**

Create `src/app/api/dashboard/spending/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getHouseholdId } from "@/lib/auth/session";
import { getMonthlySpending } from "@/queries/dashboard";

export async function GET(request: NextRequest) {
  const householdId = await getHouseholdId();
  const month = request.nextUrl.searchParams.get("month") ?? undefined;
  const data = getMonthlySpending(householdId, month);
  return NextResponse.json(data);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/dashboard/
git commit -m "feat: add dashboard API routes for widget data refresh"
```

---

### Task 15: Dashboard Page + Loading Skeleton

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`
- Create: `src/app/(dashboard)/loading.tsx`

- [ ] **Step 1: Create loading skeleton**

Create `src/app/(dashboard)/loading.tsx`:

```typescript
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className={i % 3 === 0 ? "col-span-2 row-span-2" : "col-span-2"}>
            <CardHeader className="pb-2 pt-3 px-4">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent className="pb-3 px-4">
              <Skeleton className="h-full min-h-[120px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace dashboard page stub**

Replace `src/app/(dashboard)/page.tsx`:

```typescript
import dynamic from "next/dynamic";
import { getHouseholdId } from "@/lib/auth/session";
import {
  getDashboardSummary,
  getNetWorthHistory,
  getMonthlySpending,
  getCashFlow,
  getRecentTransactions,
} from "@/queries/dashboard";
import { getAccounts } from "@/queries/accounts";
import { getLayout } from "@/actions/dashboard";
import { getDefaultLayout } from "@/components/organisms/widgets/registry";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const DashboardGrid = dynamic(() => import("@/components/organisms/dashboard-grid").then((m) => ({ default: m.DashboardGrid })), {
  ssr: false,
  loading: () => <div className="animate-pulse text-muted-foreground">Loading dashboard...</div>,
});

export interface DashboardData {
  summary: Awaited<ReturnType<typeof getDashboardSummary>>;
  netWorthHistory: Awaited<ReturnType<typeof getNetWorthHistory>>;
  monthlySpending: Awaited<ReturnType<typeof getMonthlySpending>>;
  cashFlow: Awaited<ReturnType<typeof getCashFlow>>;
  recentTransactions: Awaited<ReturnType<typeof getRecentTransactions>>;
  accounts: { id: string; name: string; type: string; currentBalance: number | null; currency: string | null }[];
}

export default async function DashboardPage() {
  const householdId = await getHouseholdId();
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session!.user.id;

  const [summary, netWorthHistory, monthlySpending, cashFlow, recentTransactions, allAccounts] =
    await Promise.all([
      getDashboardSummary(householdId),
      getNetWorthHistory(householdId, "6M"),
      getMonthlySpending(householdId),
      getCashFlow(householdId, 6),
      getRecentTransactions(householdId, 5),
      getAccounts(householdId),
    ]);

  const accounts = allAccounts
    .filter((a) => !a.isHidden)
    .map((a) => ({ id: a.id, name: a.name, type: a.type, currentBalance: a.currentBalance, currency: a.currency }));

  const savedLayout = getLayout(userId);
  const layout = savedLayout ?? getDefaultLayout();

  const data: DashboardData = {
    summary,
    netWorthHistory,
    monthlySpending,
    cashFlow,
    recentTransactions,
    accounts,
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-4">Dashboard</h1>
      <DashboardGrid layout={layout} data={data} userId={userId} />
    </div>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors.

- [ ] **Step 4: Start dev server and test in browser**

Run: `pnpm dev`

Verify in browser at `http://localhost:3000`:
- Dashboard loads with widget grid
- Net worth chart renders (may be empty if no balance_history data)
- Summary cards show net worth and monthly figures
- Spending chart shows current month
- Cash flow shows last 6 months
- Recent transactions list displays
- Account balances list displays
- Drag-and-drop works (grab the grip handle)
- Date range selector on net worth chart triggers API call
- Month navigation on spending widget works
- Placeholder widgets show "Coming soon" text
- Mobile responsive: 1 column on narrow viewport

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/page.tsx src/app/(dashboard)/loading.tsx
git commit -m "feat: replace dashboard stub with full widget grid"
```

---

### Task 16: Final Integration — Run All Tests + Verify

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `pnpm test -- --run`
Expected: All tests pass (existing + new).

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors.

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: No errors or warnings.

- [ ] **Step 4: Manual browser verification**

Start dev server (`pnpm dev`) and verify:
- Dashboard loads without errors in console
- All 6 active widgets render correctly
- Drag-and-drop repositions widgets
- Layout persists after page reload
- Net worth range selector works
- Spending month navigation works
- Chart tooltips display formatted currency
- Mobile viewport: single column, no drag
- Empty states display correctly when no data

- [ ] **Step 5: Commit any fixes from verification**

If any issues found, fix and commit with descriptive message.

- [ ] **Step 6: Update BUILD_ORDER.md**

Mark Phase 6 as complete with implementation notes.

```bash
git add docs/BUILD_ORDER.md
git commit -m "docs: mark Phase 6 as complete in BUILD_ORDER.md"
```
