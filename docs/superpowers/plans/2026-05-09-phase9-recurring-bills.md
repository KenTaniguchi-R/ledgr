# Phase 9 — Recurring Transactions + Bills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect recurring transactions via Plaid's `/transactions/recurring/get` API and present them as a bills list page + dashboard widget.

**Architecture:** Plaid recurring sync function chains after the existing 4h transaction sync. Data stored in the existing `recurring_transactions` table (with schema additions). Read-only UI — no manual CRUD. Dashboard widget replaces existing placeholder.

**Tech Stack:** Next.js 16, Drizzle ORM, SQLite, Plaid Node SDK v42, shadcn/ui v4, Tailwind v4, Vitest, MSW

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/lib/plaid/recurring.ts` | `syncRecurringTransactions()` — fetch, validate, upsert, back-link |
| `src/queries/recurring.ts` | `getUpcomingBills()`, `getRecurringSummary()` |
| `src/actions/recurring.ts` | `refreshRecurring()` server action |
| `src/components/atoms/bill-status-indicator.tsx` | Colored dot + label for bill status |
| `src/components/molecules/bill-row.tsx` | Single bill grid row |
| `src/components/molecules/bill-search.tsx` | Debounced search input updating `?q=` URL param |
| `src/components/molecules/bill-empty-state.tsx` | Empty state CTA |
| `src/components/organisms/bill-list.tsx` | Server component rendering column header + bill rows |
| `src/components/organisms/widgets/upcoming-bills.tsx` | Compact dashboard widget (next 5 bills) |
| `src/app/(dashboard)/bills/page.tsx` | Bills page server component |
| `src/app/(dashboard)/bills/loading.tsx` | Loading skeleton |
| `src/app/(dashboard)/bills/error.tsx` | Error boundary |
| `tests/integration/recurring-sync.test.ts` | Sync + error path integration tests |
| `tests/integration/recurring-queries.test.ts` | Query integration tests |

### Modified Files
| File | Change |
|------|--------|
| `src/db/schema/recurring.ts` | Add unique index on `plaidStreamId`, add `accountId` column |
| `src/db/schema/transactions.ts` | Add `.references()` to `recurringTransactionId` FK |
| `src/lib/plaid/schemas.ts` | Add recurring response Zod schemas |
| `src/lib/date-utils.ts` | Add `deriveBillStatus()` + `relativeDateLabel()` |
| `src/lib/jobs/scheduler.ts` | Chain recurring sync after transaction sync |
| `src/components/organisms/widgets/registry.ts` | Activate bills widget + update default layout |
| `src/components/organisms/dashboard-grid.tsx` | Add `upcomingBills` to `DashboardData`, render widget |
| `src/queries/dashboard.ts` | Import and call `getUpcomingBills()` |
| `src/app/(dashboard)/page.tsx` | Include `upcomingBills` in `Promise.all` |
| `src/components/organisms/sidebar-nav.tsx` | Add Bills nav item |
| `tests/mocks/handlers.ts` | Add recurring endpoint mock |
| `tests/integration/helpers.ts` | Add `insertPlaidItem()` + `insertRecurringTransaction()` |

---

## Task 1: Schema Migration + Zod Schemas

**Files:**
- Modify: `src/db/schema/recurring.ts`
- Modify: `src/db/schema/transactions.ts`
- Modify: `src/lib/plaid/schemas.ts`

- [ ] **Step 1: Add `accountId` column and unique index to `recurring_transactions`**

In `src/db/schema/recurring.ts`, add the import for `accounts` and the new column + index:

```typescript
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { households } from "./households";
import { merchants } from "./merchants";
import { categories } from "./categories";
import { accounts } from "./accounts";

export const recurringTransactions = sqliteTable(
  "recurring_transactions",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    plaidStreamId: text("plaid_stream_id"),
    accountId: text("account_id").references(() => accounts.id),
    name: text("name").notNull(),
    merchantId: text("merchant_id").references(() => merchants.id),
    categoryId: text("category_id").references(() => categories.id),
    averageAmount: integer("average_amount"),
    lastAmount: integer("last_amount"),
    frequency: text("frequency", {
      enum: ["weekly", "biweekly", "semimonthly", "monthly", "yearly"],
    }),
    lastDate: text("last_date"),
    nextDate: text("next_date"),
    isActive: integer("is_active", { mode: "boolean" }).default(true),
    isIncome: integer("is_income", { mode: "boolean" }).default(false),
    createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
    updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  },
  (table) => [
    index("idx_recurring_household").on(table.householdId),
    index("idx_recurring_next").on(table.nextDate),
    uniqueIndex("idx_recurring_plaid_stream_id").on(table.plaidStreamId),
  ]
);
```

- [ ] **Step 2: Add `.references()` to `recurringTransactionId` in transactions schema**

In `src/db/schema/transactions.ts`, add the import and reference:

```typescript
import { recurringTransactions } from "./recurring";
```

Change line 22 from:
```typescript
    recurringTransactionId: text("recurring_transaction_id"),
```
to:
```typescript
    recurringTransactionId: text("recurring_transaction_id").references(() => recurringTransactions.id),
```

**Note:** This creates a circular import between `transactions.ts` and `recurring.ts`. If Drizzle complains, keep the FK as a plain text column without `.references()` — the back-link UPDATE in `recurring.ts` enforces integrity at the application layer.

- [ ] **Step 3: Add Zod schemas for Plaid recurring response**

Append to `src/lib/plaid/schemas.ts`:

```typescript
// ─── Recurring Streams ──────────────────────────────────────────────────────

export const PlaidStreamAmountSchema = z.object({
  amount: z.number().nullable(),
  iso_currency_code: z.string().nullable(),
  unofficial_currency_code: z.string().nullable().optional(),
});

export const PlaidRecurringStreamSchema = z
  .object({
    stream_id: z.string(),
    account_id: z.string(),
    description: z.string(),
    merchant_name: z.string().nullable(),
    first_date: z.string(),
    last_date: z.string(),
    predicted_next_date: z.string().nullable(),
    average_amount: PlaidStreamAmountSchema,
    last_amount: PlaidStreamAmountSchema,
    frequency: z.enum([
      "WEEKLY",
      "BIWEEKLY",
      "SEMI_MONTHLY",
      "MONTHLY",
      "ANNUALLY",
      "UNKNOWN",
    ]),
    is_active: z.boolean(),
    transaction_ids: z.array(z.string()),
    personal_finance_category: z
      .object({
        primary: z.string(),
        detailed: z.string(),
        confidence_level: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    category: z.array(z.string()).optional(),
    status: z
      .enum(["MATURE", "EARLY_DETECTION", "TOMBSTONED", "UNKNOWN"])
      .optional(),
  })
  .passthrough();

export type PlaidRecurringStream = z.infer<typeof PlaidRecurringStreamSchema>;

export const PlaidRecurringResponseSchema = z.object({
  inflow_streams: z.array(PlaidRecurringStreamSchema),
  outflow_streams: z.array(PlaidRecurringStreamSchema),
  request_id: z.string(),
});

export type PlaidRecurringResponse = z.infer<
  typeof PlaidRecurringResponseSchema
>;
```

- [ ] **Step 4: Generate and run Drizzle migration**

Run: `pnpm db:generate && pnpm db:migrate`
Expected: Migration succeeds, new column + indexes applied.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/recurring.ts src/db/schema/transactions.ts src/lib/plaid/schemas.ts drizzle/
git commit -m "feat(phase9): add recurring schema migration + Plaid recurring Zod schemas"
```

---

## Task 2: MSW Mock + Test Helpers

**Files:**
- Modify: `tests/mocks/handlers.ts`
- Modify: `tests/integration/helpers.ts`

- [ ] **Step 1: Add MSW mock for `/transactions/recurring/get`**

Append to `tests/mocks/handlers.ts` before the `allHandlers` line:

```typescript
export const TEST_STREAM_IDS = {
  netflix: "stream-netflix-1",
  salary: "stream-salary-1",
  gym: "stream-gym-1",
} as const;

export const recurringGetHandler = http.post(
  "https://sandbox.plaid.com/transactions/recurring/get",
  () =>
    HttpResponse.json({
      inflow_streams: [
        {
          stream_id: TEST_STREAM_IDS.salary,
          account_id: "plaid-acc-checking",
          description: "DIRECT DEPOSIT EMPLOYER",
          merchant_name: null,
          first_date: "2025-01-15",
          last_date: "2026-04-15",
          predicted_next_date: "2026-05-15",
          average_amount: { amount: -3000.0, iso_currency_code: "USD", unofficial_currency_code: null },
          last_amount: { amount: -3000.0, iso_currency_code: "USD", unofficial_currency_code: null },
          frequency: "MONTHLY",
          is_active: true,
          transaction_ids: [TEST_TXN_IDS.added2],
          personal_finance_category: { primary: "INCOME", detailed: "INCOME_WAGES", confidence_level: "VERY_HIGH" },
          status: "MATURE",
        },
      ],
      outflow_streams: [
        {
          stream_id: TEST_STREAM_IDS.netflix,
          account_id: "plaid-acc-checking",
          description: "NETFLIX.COM",
          merchant_name: "Netflix",
          first_date: "2025-06-01",
          last_date: "2026-04-01",
          predicted_next_date: "2026-05-01",
          average_amount: { amount: 15.99, iso_currency_code: "USD", unofficial_currency_code: null },
          last_amount: { amount: 15.99, iso_currency_code: "USD", unofficial_currency_code: null },
          frequency: "MONTHLY",
          is_active: true,
          transaction_ids: [],
          personal_finance_category: { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_TV_AND_MOVIES", confidence_level: "VERY_HIGH" },
          status: "MATURE",
        },
        {
          stream_id: TEST_STREAM_IDS.gym,
          account_id: "plaid-acc-checking",
          description: "PLANET FITNESS",
          merchant_name: "Planet Fitness",
          first_date: "2025-03-01",
          last_date: "2026-04-01",
          predicted_next_date: "2026-05-01",
          average_amount: { amount: 25.0, iso_currency_code: "USD", unofficial_currency_code: null },
          last_amount: { amount: 25.0, iso_currency_code: "USD", unofficial_currency_code: null },
          frequency: "MONTHLY",
          is_active: true,
          transaction_ids: [],
          personal_finance_category: null,
          status: "MATURE",
        },
      ],
      request_id: "req-recurring-test",
    })
);

export const recurringEmptyHandler = http.post(
  "https://sandbox.plaid.com/transactions/recurring/get",
  () =>
    HttpResponse.json({
      inflow_streams: [],
      outflow_streams: [],
      request_id: "req-recurring-empty",
    })
);

export const recurringErrorHandler = http.post(
  "https://sandbox.plaid.com/transactions/recurring/get",
  () =>
    HttpResponse.json(
      { error_type: "INVALID_REQUEST", error_code: "PRODUCT_NOT_READY", error_message: "Recurring not ready" },
      { status: 400 }
    )
);
```

Update the `allHandlers` export:

```typescript
export const allHandlers = [...plaidHandlers, webhookKeyHandler, recurringGetHandler];
```

- [ ] **Step 2: Add `insertPlaidItem` and `insertRecurringTransaction` helpers**

Append to `tests/integration/helpers.ts`:

```typescript
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
  plaidItems,
  recurringTransactions,
} from "../../src/db/schema";
import { encrypt } from "../../src/lib/encryption";
```

Update the existing import to include `plaidItems` and `recurringTransactions`, then add:

```typescript
export function insertPlaidItem(
  db: LedgrDb,
  householdId: string,
  overrides: Partial<typeof plaidItems.$inferInsert> = {},
) {
  const id = uuid();
  const now = new Date().toISOString();
  db.insert(plaidItems)
    .values({
      id,
      householdId,
      accessToken: encrypt("access-sandbox-test-token"),
      plaidInstitutionId: "ins_1",
      plaidItemId: `plaid-item-${id.slice(0, 8)}`,
      institutionName: "Test Bank",
      status: "active",
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .run();
  return { plaidItemId: id };
}

export function insertRecurringTransaction(
  db: LedgrDb,
  householdId: string,
  overrides: Partial<typeof recurringTransactions.$inferInsert> = {},
) {
  const id = uuid();
  const now = new Date().toISOString();
  db.insert(recurringTransactions)
    .values({
      id,
      householdId,
      name: "Test Recurring",
      isActive: true,
      isIncome: false,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .run();
  return { recurringId: id };
}
```

- [ ] **Step 3: Commit**

```bash
git add tests/mocks/handlers.ts tests/integration/helpers.ts
git commit -m "test(phase9): add MSW recurring mock + test helpers"
```

---

## Task 3: Plaid Recurring Sync Logic

**Files:**
- Create: `src/lib/plaid/recurring.ts`
- Create: `tests/integration/recurring-sync.test.ts`

- [ ] **Step 1: Write the failing integration tests**

Create `tests/integration/recurring-sync.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { server } from "../mocks/server";
import {
  recurringGetHandler,
  recurringEmptyHandler,
  recurringErrorHandler,
  TEST_STREAM_IDS,
  TEST_TXN_IDS,
} from "../mocks/handlers";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertPlaidItem,
  insertAccount,
  insertTransaction,
} from "./helpers";
import { recurringTransactions, transactions } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import type { LedgrDb } from "../../src/db";

let db: LedgrDb;

beforeEach(() => {
  db = createTestDb();
});

afterEach(() => {
  server.resetHandlers();
});

function seedForSync(db: LedgrDb) {
  const { householdId } = insertHousehold(db);
  const { plaidItemId } = insertPlaidItem(db, householdId);
  const { accountId } = insertAccount(db, householdId, {
    plaidItemId,
    plaidAccountId: "plaid-acc-checking",
  });
  return { householdId, plaidItemId, accountId };
}

describe("syncRecurringTransactions", () => {
  it("upserts new recurring streams from Plaid response", async () => {
    server.use(recurringGetHandler);
    const { householdId, plaidItemId } = seedForSync(db);

    const { syncRecurringTransactions } = await import(
      "../../src/lib/plaid/recurring"
    );
    const result = await syncRecurringTransactions(
      plaidItemId,
      householdId,
      "access-sandbox-test-token",
      db,
    );

    expect(result.upserted).toBe(3);
    expect(result.deactivated).toBe(0);

    const rows = db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.householdId, householdId))
      .all();
    expect(rows).toHaveLength(3);

    const netflix = rows.find((r) => r.plaidStreamId === TEST_STREAM_IDS.netflix);
    expect(netflix).toBeDefined();
    expect(netflix!.name).toBe("Netflix");
    expect(netflix!.averageAmount).toBe(1599);
    expect(netflix!.frequency).toBe("monthly");
    expect(netflix!.isIncome).toBe(false);
    expect(netflix!.isActive).toBe(true);

    const salary = rows.find((r) => r.plaidStreamId === TEST_STREAM_IDS.salary);
    expect(salary).toBeDefined();
    expect(salary!.isIncome).toBe(true);
    expect(salary!.averageAmount).toBe(-300000);
  });

  it("updates existing stream when amounts/dates change", async () => {
    const { householdId, plaidItemId } = seedForSync(db);

    // Insert existing stream
    db.insert(recurringTransactions)
      .values({
        id: "existing-1",
        householdId,
        plaidStreamId: TEST_STREAM_IDS.netflix,
        name: "Old Netflix",
        averageAmount: 999,
        frequency: "monthly",
        isActive: true,
        isIncome: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .run();

    server.use(recurringGetHandler);

    const { syncRecurringTransactions } = await import(
      "../../src/lib/plaid/recurring"
    );
    const result = await syncRecurringTransactions(
      plaidItemId,
      householdId,
      "access-sandbox-test-token",
      db,
    );

    // netflix updated (1 upsert), gym + salary inserted (2 new) = 3 total
    expect(result.upserted).toBe(3);

    const netflix = db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.plaidStreamId, TEST_STREAM_IDS.netflix))
      .get();
    expect(netflix!.averageAmount).toBe(1599);
    expect(netflix!.name).toBe("Netflix");
  });

  it("deactivates streams missing from response", async () => {
    const { householdId, plaidItemId } = seedForSync(db);

    // Insert a stream that won't be in the response
    db.insert(recurringTransactions)
      .values({
        id: "old-stream-1",
        householdId,
        plaidStreamId: "stream-cancelled-service",
        name: "Cancelled Service",
        isActive: true,
        isIncome: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .run();

    server.use(recurringGetHandler);

    const { syncRecurringTransactions } = await import(
      "../../src/lib/plaid/recurring"
    );
    const result = await syncRecurringTransactions(
      plaidItemId,
      householdId,
      "access-sandbox-test-token",
      db,
    );

    expect(result.deactivated).toBe(1);

    const cancelled = db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.plaidStreamId, "stream-cancelled-service"))
      .get();
    expect(cancelled!.isActive).toBe(false);
  });

  it("back-links transactions via recurringTransactionId", async () => {
    const { householdId, plaidItemId, accountId } = seedForSync(db);

    // Insert a transaction that matches the salary stream's transaction_ids
    insertTransaction(db, householdId, accountId, {
      plaidTransactionId: TEST_TXN_IDS.added2,
    });

    server.use(recurringGetHandler);

    const { syncRecurringTransactions } = await import(
      "../../src/lib/plaid/recurring"
    );
    await syncRecurringTransactions(
      plaidItemId,
      householdId,
      "access-sandbox-test-token",
      db,
    );

    const txn = db
      .select()
      .from(transactions)
      .where(eq(transactions.plaidTransactionId, TEST_TXN_IDS.added2))
      .get();

    expect(txn!.recurringTransactionId).not.toBeNull();

    // Verify it points to the salary recurring row
    const salary = db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.plaidStreamId, TEST_STREAM_IDS.salary))
      .get();
    expect(txn!.recurringTransactionId).toBe(salary!.id);
  });

  it("isolates recurring streams by household", async () => {
    const { householdId: h1, plaidItemId: p1 } = seedForSync(db);
    const { householdId: h2 } = insertHousehold(db, "Other Household");

    server.use(recurringGetHandler);

    const { syncRecurringTransactions } = await import(
      "../../src/lib/plaid/recurring"
    );
    await syncRecurringTransactions(p1, h1, "access-sandbox-test-token", db);

    const h2Rows = db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.householdId, h2))
      .all();
    expect(h2Rows).toHaveLength(0);

    const h1Rows = db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.householdId, h1))
      .all();
    expect(h1Rows).toHaveLength(3);
  });

  it("returns zeros on Plaid API error (non-fatal)", async () => {
    server.use(recurringErrorHandler);
    const { householdId, plaidItemId } = seedForSync(db);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { syncRecurringTransactions } = await import(
      "../../src/lib/plaid/recurring"
    );
    const result = await syncRecurringTransactions(
      plaidItemId,
      householdId,
      "access-sandbox-test-token",
      db,
    );

    expect(result).toEqual({ upserted: 0, deactivated: 0 });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("returns zeros on Zod validation failure (non-fatal)", async () => {
    server.use(
      http.post("https://sandbox.plaid.com/transactions/recurring/get", () =>
        HttpResponse.json({ bad_field: true })
      )
    );
    const { householdId, plaidItemId } = seedForSync(db);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { syncRecurringTransactions } = await import(
      "../../src/lib/plaid/recurring"
    );
    const result = await syncRecurringTransactions(
      plaidItemId,
      householdId,
      "access-sandbox-test-token",
      db,
    );

    expect(result).toEqual({ upserted: 0, deactivated: 0 });
    consoleSpy.mockRestore();
  });
});
```

Add the missing `http` import at the top:

```typescript
import { http, HttpResponse } from "msw";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/integration/recurring-sync.test.ts`
Expected: FAIL — module `../../src/lib/plaid/recurring` does not exist.

- [ ] **Step 3: Implement `syncRecurringTransactions`**

Create `src/lib/plaid/recurring.ts`:

```typescript
import { v4 as uuid } from "uuid";
import { eq, and, inArray } from "drizzle-orm";
import { getPlaidClient } from "./client";
import {
  PlaidRecurringResponseSchema,
  type PlaidRecurringStream,
} from "./schemas";
import { plaidAmountToCents } from "@/lib/money";
import { nowISO } from "./utils";
import type { LedgrDb } from "@/db";
import { db as defaultDb } from "@/db";
import {
  recurringTransactions,
  transactions,
  accounts,
  merchants,
} from "@/db/schema";

const FREQUENCY_MAP: Record<string, string | null> = {
  WEEKLY: "weekly",
  BIWEEKLY: "biweekly",
  SEMI_MONTHLY: "semimonthly",
  MONTHLY: "monthly",
  ANNUALLY: "yearly",
  UNKNOWN: null,
};

function titleCase(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function syncRecurringTransactions(
  plaidItemId: string,
  householdId: string,
  accessToken: string,
  db: LedgrDb = defaultDb,
): Promise<{ upserted: number; deactivated: number }> {
  try {
    const client = getPlaidClient();

    // Fetch account IDs for this item
    const itemAccounts = db
      .select({ plaidAccountId: accounts.plaidAccountId, id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.householdId, householdId),
          eq(accounts.plaidItemId, plaidItemId),
        ),
      )
      .all();

    const accountIds = itemAccounts
      .map((a) => a.plaidAccountId)
      .filter((id): id is string => id !== null);

    const plaidToInternalAccount = new Map<string, string>();
    for (const a of itemAccounts) {
      if (a.plaidAccountId) plaidToInternalAccount.set(a.plaidAccountId, a.id);
    }

    const response = await client.transactionsRecurringGet({
      access_token: accessToken,
      account_ids: accountIds,
    });

    const parsed = PlaidRecurringResponseSchema.parse(response.data);

    const allStreams: Array<PlaidRecurringStream & { isIncome: boolean }> = [
      ...parsed.inflow_streams.map((s) => ({ ...s, isIncome: true })),
      ...parsed.outflow_streams.map((s) => ({ ...s, isIncome: false })),
    ];

    const now = nowISO();
    let upserted = 0;
    let deactivated = 0;

    const seenStreamIds = new Set<string>();

    db.transaction((tx) => {
      // Build merchant lookup
      const existingMerchants = tx
        .select({ id: merchants.id, name: merchants.name })
        .from(merchants)
        .where(eq(merchants.householdId, householdId))
        .all();
      const merchantNameToId = new Map(existingMerchants.map((m) => [m.name, m.id]));

      for (const stream of allStreams) {
        seenStreamIds.add(stream.stream_id);

        const merchantName = stream.merchant_name
          ? titleCase(stream.merchant_name)
          : null;

        // Lookup or create merchant
        let merchantId: string | null = null;
        if (merchantName) {
          merchantId = merchantNameToId.get(merchantName) ?? null;
          if (!merchantId) {
            merchantId = uuid();
            tx.insert(merchants)
              .values({
                id: merchantId,
                householdId,
                name: merchantName,
                rawNames: JSON.stringify([stream.merchant_name]),
                createdAt: now,
                updatedAt: now,
              })
              .run();
            merchantNameToId.set(merchantName, merchantId);
          }
        }

        const internalAccountId = plaidToInternalAccount.get(stream.account_id) ?? null;

        const frequency = FREQUENCY_MAP[stream.frequency] ?? null;
        const averageAmount = plaidAmountToCents(stream.average_amount.amount);
        const lastAmount = plaidAmountToCents(stream.last_amount.amount);
        const name = merchantName ?? titleCase(stream.description);

        // Check if stream already exists
        const existing = tx
          .select({ id: recurringTransactions.id })
          .from(recurringTransactions)
          .where(eq(recurringTransactions.plaidStreamId, stream.stream_id))
          .get();

        if (existing) {
          tx.update(recurringTransactions)
            .set({
              name,
              merchantId,
              accountId: internalAccountId,
              averageAmount,
              lastAmount,
              frequency,
              lastDate: stream.last_date,
              nextDate: stream.predicted_next_date,
              isActive: stream.is_active,
              isIncome: stream.isIncome,
              updatedAt: now,
            })
            .where(eq(recurringTransactions.id, existing.id))
            .run();
        } else {
          tx.insert(recurringTransactions)
            .values({
              id: uuid(),
              householdId,
              plaidStreamId: stream.stream_id,
              accountId: internalAccountId,
              name,
              merchantId,
              averageAmount,
              lastAmount,
              frequency,
              lastDate: stream.last_date,
              nextDate: stream.predicted_next_date,
              isActive: stream.is_active,
              isIncome: stream.isIncome,
              createdAt: now,
              updatedAt: now,
            })
            .run();
        }
        upserted++;

        // Back-link transactions
        if (stream.transaction_ids.length > 0) {
          const recurringRow = tx
            .select({ id: recurringTransactions.id })
            .from(recurringTransactions)
            .where(eq(recurringTransactions.plaidStreamId, stream.stream_id))
            .get();

          if (recurringRow) {
            for (const plaidTxnId of stream.transaction_ids) {
              tx.update(transactions)
                .set({ recurringTransactionId: recurringRow.id, updatedAt: now })
                .where(
                  and(
                    eq(transactions.plaidTransactionId, plaidTxnId),
                    eq(transactions.householdId, householdId),
                  ),
                )
                .run();
            }
          }
        }
      }

      // Deactivate streams not in response (for this household's plaid items)
      const allExisting = tx
        .select({
          id: recurringTransactions.id,
          plaidStreamId: recurringTransactions.plaidStreamId,
        })
        .from(recurringTransactions)
        .where(
          and(
            eq(recurringTransactions.householdId, householdId),
            eq(recurringTransactions.isActive, true),
          ),
        )
        .all();

      for (const row of allExisting) {
        if (row.plaidStreamId && !seenStreamIds.has(row.plaidStreamId)) {
          tx.update(recurringTransactions)
            .set({ isActive: false, updatedAt: now })
            .where(eq(recurringTransactions.id, row.id))
            .run();
          deactivated++;
        }
      }
    });

    return { upserted, deactivated };
  } catch (err) {
    console.error(
      `[recurring] Failed to sync recurring for item ${plaidItemId}:`,
      err,
    );
    return { upserted: 0, deactivated: 0 };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/integration/recurring-sync.test.ts`
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plaid/recurring.ts tests/integration/recurring-sync.test.ts
git commit -m "feat(phase9): implement recurring transaction sync with integration tests"
```

---

## Task 4: Queries + Query Tests

**Files:**
- Create: `src/queries/recurring.ts`
- Create: `tests/integration/recurring-queries.test.ts`
- Modify: `src/lib/date-utils.ts`

- [ ] **Step 1: Add `deriveBillStatus` and `relativeDateLabel` to date-utils**

Append to `src/lib/date-utils.ts`:

```typescript
export type BillStatus = "overdue" | "due-soon" | "upcoming" | "inactive";

export function deriveBillStatus(
  nextDate: string | null,
  isActive: boolean,
): BillStatus {
  if (!isActive) return "inactive";
  if (!nextDate) return "upcoming";
  const today = todayDateString();
  if (nextDate < today) return "overdue";
  const threeDaysOut = new Date();
  threeDaysOut.setDate(threeDaysOut.getDate() + 3);
  const threshold = threeDaysOut.toISOString().slice(0, 10);
  if (nextDate <= threshold) return "due-soon";
  return "upcoming";
}

export function relativeDateLabel(dateStr: string): string {
  const today = new Date(todayDateString() + "T12:00:00");
  const target = new Date(dateStr + "T12:00:00");
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / 86400000,
  );
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays <= 7) return `in ${diffDays} days`;
  return target.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
```

- [ ] **Step 2: Write the failing query tests**

Create `tests/integration/recurring-queries.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertRecurringTransaction,
  insertAccount,
} from "./helpers";
import type { LedgrDb } from "../../src/db";

let db: LedgrDb;

beforeEach(() => {
  db = createTestDb();
});

describe("getUpcomingBills", () => {
  it("returns active outflows sorted by nextDate", async () => {
    const { householdId } = insertHousehold(db);

    insertRecurringTransaction(db, householdId, {
      name: "Netflix",
      nextDate: "2026-05-15",
      isActive: true,
      isIncome: false,
      averageAmount: 1599,
      frequency: "monthly",
    });
    insertRecurringTransaction(db, householdId, {
      name: "Gym",
      nextDate: "2026-05-10",
      isActive: true,
      isIncome: false,
      averageAmount: 2500,
      frequency: "monthly",
    });
    // income — should be excluded
    insertRecurringTransaction(db, householdId, {
      name: "Salary",
      nextDate: "2026-05-01",
      isActive: true,
      isIncome: true,
      averageAmount: -300000,
      frequency: "monthly",
    });
    // inactive — should be excluded
    insertRecurringTransaction(db, householdId, {
      name: "Old Service",
      nextDate: "2026-05-01",
      isActive: false,
      isIncome: false,
    });

    const { getUpcomingBills } = await import("../../src/queries/recurring");
    const bills = getUpcomingBills(householdId, {}, db);

    expect(bills).toHaveLength(2);
    expect(bills[0].name).toBe("Gym");
    expect(bills[1].name).toBe("Netflix");
  });

  it("filters by search term", async () => {
    const { householdId } = insertHousehold(db);

    insertRecurringTransaction(db, householdId, {
      name: "Netflix",
      nextDate: "2026-05-15",
      isActive: true,
      isIncome: false,
    });
    insertRecurringTransaction(db, householdId, {
      name: "Gym",
      nextDate: "2026-05-10",
      isActive: true,
      isIncome: false,
    });

    const { getUpcomingBills } = await import("../../src/queries/recurring");
    const bills = getUpcomingBills(householdId, { search: "net" }, db);

    expect(bills).toHaveLength(1);
    expect(bills[0].name).toBe("Netflix");
  });
});

describe("getRecurringSummary", () => {
  it("normalizes amounts to monthly using exact fractions", async () => {
    const { householdId } = insertHousehold(db);

    // Weekly expense: $10/week → $10 × 52/12 per month
    insertRecurringTransaction(db, householdId, {
      name: "Weekly Coffee",
      averageAmount: 1000,
      frequency: "weekly",
      isActive: true,
      isIncome: false,
    });
    // Monthly income: $3000/month
    insertRecurringTransaction(db, householdId, {
      name: "Salary",
      averageAmount: 300000,
      frequency: "monthly",
      isActive: true,
      isIncome: true,
    });
    // Yearly expense: $120/year → $10/month
    insertRecurringTransaction(db, householdId, {
      name: "Annual Sub",
      averageAmount: 12000,
      frequency: "yearly",
      isActive: true,
      isIncome: false,
    });

    const { getRecurringSummary } = await import("../../src/queries/recurring");
    const summary = getRecurringSummary(householdId, db);

    expect(summary.monthlyIncome).toBe(300000);
    // weekly: 1000 * 52/12 ≈ 4333, yearly: 12000/12 = 1000
    expect(summary.monthlyExpenses).toBe(Math.round(1000 * (52 / 12)) + 1000);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run tests/integration/recurring-queries.test.ts`
Expected: FAIL — module `../../src/queries/recurring` does not exist.

- [ ] **Step 4: Implement queries**

Create `src/queries/recurring.ts`:

```typescript
import { eq, and, asc, like, or } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { recurringTransactions, merchants, categories } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { deriveBillStatus, relativeDateLabel, type BillStatus } from "@/lib/date-utils";

export interface BillRow {
  id: string;
  name: string;
  merchantName: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  averageAmount: number | null;
  lastAmount: number | null;
  frequency: string | null;
  nextDate: string | null;
  lastDate: string | null;
  isIncome: boolean;
  status: BillStatus;
  relativeDateLabel: string | null;
}

export function getUpcomingBills(
  householdId: string,
  opts: { search?: string; limit?: number } = {},
  db: LedgrDb = defaultDb,
): BillRow[] {
  const scoped = scopedQuery(householdId, db);

  const conditions = [
    eq(recurringTransactions.isActive, true),
    eq(recurringTransactions.isIncome, false),
  ];

  if (opts.search) {
    const pattern = `%${opts.search}%`;
    conditions.push(
      or(
        like(recurringTransactions.name, pattern),
      )!,
    );
  }

  let query = db
    .select({
      id: recurringTransactions.id,
      name: recurringTransactions.name,
      merchantName: merchants.name,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      averageAmount: recurringTransactions.averageAmount,
      lastAmount: recurringTransactions.lastAmount,
      frequency: recurringTransactions.frequency,
      nextDate: recurringTransactions.nextDate,
      lastDate: recurringTransactions.lastDate,
      isIncome: recurringTransactions.isIncome,
      isActive: recurringTransactions.isActive,
    })
    .from(recurringTransactions)
    .leftJoin(merchants, eq(recurringTransactions.merchantId, merchants.id))
    .leftJoin(categories, eq(recurringTransactions.categoryId, categories.id))
    .where(scoped.where(recurringTransactions, ...conditions))
    .orderBy(asc(recurringTransactions.nextDate))
    .all();

  if (opts.limit) {
    query = query.slice(0, opts.limit);
  }

  return query.map((row) => ({
    id: row.id,
    name: row.name,
    merchantName: row.merchantName,
    categoryName: row.categoryName,
    categoryIcon: row.categoryIcon,
    averageAmount: row.averageAmount ? Math.abs(row.averageAmount) : null,
    lastAmount: row.lastAmount ? Math.abs(row.lastAmount) : null,
    frequency: row.frequency,
    nextDate: row.nextDate,
    lastDate: row.lastDate,
    isIncome: Boolean(row.isIncome),
    status: deriveBillStatus(row.nextDate, Boolean(row.isActive)),
    relativeDateLabel: row.nextDate ? relativeDateLabel(row.nextDate) : null,
  }));
}

const MONTHLY_MULTIPLIER: Record<string, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  semimonthly: 2,
  monthly: 1,
  yearly: 1 / 12,
};

export function getRecurringSummary(
  householdId: string,
  db: LedgrDb = defaultDb,
): { monthlyIncome: number; monthlyExpenses: number } {
  const scoped = scopedQuery(householdId, db);

  const rows = db
    .select({
      averageAmount: recurringTransactions.averageAmount,
      frequency: recurringTransactions.frequency,
      isIncome: recurringTransactions.isIncome,
    })
    .from(recurringTransactions)
    .where(
      scoped.where(recurringTransactions, eq(recurringTransactions.isActive, true)),
    )
    .all();

  let monthlyIncome = 0;
  let monthlyExpenses = 0;

  for (const row of rows) {
    if (!row.averageAmount || !row.frequency) continue;
    const multiplier = MONTHLY_MULTIPLIER[row.frequency] ?? 1;
    const monthly = Math.round(Math.abs(row.averageAmount) * multiplier);
    if (row.isIncome) {
      monthlyIncome += monthly;
    } else {
      monthlyExpenses += monthly;
    }
  }

  return { monthlyIncome, monthlyExpenses };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run tests/integration/recurring-queries.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/queries/recurring.ts src/lib/date-utils.ts tests/integration/recurring-queries.test.ts
git commit -m "feat(phase9): add recurring queries with date utils and integration tests"
```

---

## Task 5: Server Action + Scheduler Integration

**Files:**
- Create: `src/actions/recurring.ts`
- Modify: `src/lib/jobs/scheduler.ts`

- [ ] **Step 1: Create the `refreshRecurring` server action**

Create `src/actions/recurring.ts`:

```typescript
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db as defaultDb, type LedgrDb } from "@/db";
import { plaidItems } from "@/db/schema";
import { getHouseholdId } from "@/lib/auth/session";
import { decrypt } from "@/lib/encryption";
import { syncRecurringTransactions } from "@/lib/plaid/recurring";

export async function refreshRecurring(
  dbInstance: LedgrDb = defaultDb,
): Promise<
  { success: true; upserted: number; deactivated: number } | { error: string }
> {
  try {
    const householdId = await getHouseholdId();

    const activeItems = dbInstance
      .select({ id: plaidItems.id, accessToken: plaidItems.accessToken })
      .from(plaidItems)
      .where(eq(plaidItems.status, "active"))
      .all()
      .filter((item) => {
        const itemHousehold = dbInstance
          .select({ householdId: plaidItems.householdId })
          .from(plaidItems)
          .where(eq(plaidItems.id, item.id))
          .get();
        return itemHousehold?.householdId === householdId;
      });

    let totalUpserted = 0;
    let totalDeactivated = 0;

    for (const item of activeItems) {
      const accessToken = decrypt(item.accessToken);
      const result = await syncRecurringTransactions(
        item.id,
        householdId,
        accessToken,
        dbInstance,
      );
      totalUpserted += result.upserted;
      totalDeactivated += result.deactivated;
    }

    revalidatePath("/bills");
    revalidatePath("/");

    return {
      success: true,
      upserted: totalUpserted,
      deactivated: totalDeactivated,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to refresh recurring";
    return { error: message };
  }
}
```

- [ ] **Step 2: Chain recurring sync in scheduler**

In `src/lib/jobs/scheduler.ts`, add the import at the top:

```typescript
import { syncRecurringTransactions } from "@/lib/plaid/recurring";
import { decrypt } from "@/lib/encryption";
```

Replace the transaction sync cron job body (lines 48-61) with:

```typescript
    for (const item of activeItems) {
      try {
        const result = await syncInstitution(item.id, item.householdId, db);
        if (result.success) {
          console.log(
            `[scheduler] Synced ${item.id}: +${result.addedCount} ~${result.modifiedCount} -${result.removedCount}`
          );
          // Chain recurring sync after successful transaction sync
          try {
            const itemRow = db
              .select({ accessToken: plaidItems.accessToken })
              .from(plaidItems)
              .where(eq(plaidItems.id, item.id))
              .get();
            if (itemRow) {
              const accessToken = decrypt(itemRow.accessToken);
              const recurring = await syncRecurringTransactions(
                item.id,
                item.householdId,
                accessToken,
                db,
              );
              console.log(
                `[scheduler] Recurring for ${item.id}: ${recurring.upserted} upserted, ${recurring.deactivated} deactivated`
              );
            }
          } catch (recurringErr) {
            console.error(`[scheduler] Recurring sync failed for ${item.id}:`, recurringErr);
          }
        } else {
          console.error(`[scheduler] Sync failed for ${item.id}: ${result.error}`);
        }
      } catch (e) {
        console.error(`[scheduler] Unexpected error syncing ${item.id}:`, e);
      }
    }
```

- [ ] **Step 3: Commit**

```bash
git add src/actions/recurring.ts src/lib/jobs/scheduler.ts
git commit -m "feat(phase9): add refreshRecurring action + chain recurring in scheduler"
```

---

## Task 6: Frontend Components — Atoms + Molecules

**Files:**
- Create: `src/components/atoms/bill-status-indicator.tsx`
- Create: `src/components/molecules/bill-row.tsx`
- Create: `src/components/molecules/bill-search.tsx`
- Create: `src/components/molecules/bill-empty-state.tsx`

- [ ] **Step 1: Create `BillStatusIndicator` atom**

Create `src/components/atoms/bill-status-indicator.tsx`:

```tsx
import { cn } from "@/lib/utils";
import type { BillStatus } from "@/lib/date-utils";

interface BillStatusIndicatorProps {
  status: BillStatus;
}

const config: Record<BillStatus, { label: string; dotClass: string }> = {
  overdue: { label: "Overdue", dotClass: "bg-destructive" },
  "due-soon": { label: "Due soon", dotClass: "bg-amber-500" },
  upcoming: { label: "Upcoming", dotClass: "bg-muted-foreground/40" },
  inactive: { label: "Inactive", dotClass: "bg-muted-foreground/30" },
};

export function BillStatusIndicator({ status }: BillStatusIndicatorProps) {
  const { label, dotClass } = config[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", dotClass)} aria-hidden />
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Create `BillRow` molecule**

Create `src/components/molecules/bill-row.tsx`:

```tsx
import { AmountDisplay } from "@/components/atoms/amount-display";
import { BillStatusIndicator } from "@/components/atoms/bill-status-indicator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BillRow as BillRowType } from "@/queries/recurring";

interface BillRowProps {
  bill: BillRowType;
}

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  semimonthly: "2x/mo",
  monthly: "Monthly",
  yearly: "Yearly",
};

export function BillRow({ bill }: BillRowProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_140px_100px_100px_120px] items-center h-10 px-3 text-sm border-b border-border/50",
        bill.status === "overdue" && "border-l-2 border-l-destructive",
      )}
    >
      <span className="font-medium truncate">{bill.name}</span>
      <span className="text-muted-foreground truncate text-xs">
        {bill.categoryName ?? "Uncategorized"}
      </span>
      <span className="text-right">
        {bill.averageAmount !== null && (
          <AmountDisplay amount={bill.averageAmount} />
        )}
      </span>
      <span>
        {bill.frequency && (
          <Badge variant="outline" className="text-xs font-normal">
            {FREQUENCY_LABELS[bill.frequency] ?? bill.frequency}
          </Badge>
        )}
      </span>
      <span className="flex flex-col items-end gap-0.5">
        <BillStatusIndicator status={bill.status} />
        {bill.relativeDateLabel && (
          <span className="text-[11px] text-muted-foreground">
            {bill.relativeDateLabel}
          </span>
        )}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Create `BillSearch` molecule**

Create `src/components/molecules/bill-search.tsx`:

```tsx
"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function BillSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const updateSearch = useCallback(
    (newValue: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (newValue) {
        params.set("q", newValue);
      } else {
        params.delete("q");
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  function handleChange(newValue: string) {
    setValue(newValue);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateSearch(newValue), 300);
  }

  return (
    <div className="relative w-[240px]">
      <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder="Search bills..."
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className="pl-8 h-8"
      />
    </div>
  );
}
```

- [ ] **Step 4: Create `BillEmptyState` molecule**

Create `src/components/molecules/bill-empty-state.tsx`:

```tsx
import { CalendarX2, ArrowRight } from "lucide-react";
import Link from "next/link";

export function BillEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <CalendarX2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
      <h3 className="text-lg font-medium">No recurring bills detected yet</h3>
      <p className="text-sm text-muted-foreground mt-1">
        Connect an account and sync transactions — bills are identified automatically.
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

- [ ] **Step 5: Commit**

```bash
git add src/components/atoms/bill-status-indicator.tsx src/components/molecules/bill-row.tsx src/components/molecules/bill-search.tsx src/components/molecules/bill-empty-state.tsx
git commit -m "feat(phase9): add bill UI components — atom, molecules"
```

---

## Task 7: Frontend Components — Organisms + Widget

**Files:**
- Create: `src/components/organisms/bill-list.tsx`
- Create: `src/components/organisms/widgets/upcoming-bills.tsx`

- [ ] **Step 1: Create `BillList` organism**

Create `src/components/organisms/bill-list.tsx`:

```tsx
import { BillRow } from "@/components/molecules/bill-row";
import type { BillRow as BillRowType } from "@/queries/recurring";

interface BillListProps {
  bills: BillRowType[];
}

export function BillList({ bills }: BillListProps) {
  return (
    <div>
      <div className="grid grid-cols-[1fr_140px_100px_100px_120px] items-center h-8 px-3 text-xs font-medium text-muted-foreground border-b">
        <span>Name</span>
        <span>Category</span>
        <span className="text-right">Amount</span>
        <span>Frequency</span>
        <span className="text-right">Status</span>
      </div>
      {bills.map((bill) => (
        <BillRow key={bill.id} bill={bill} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `UpcomingBillsWidget` organism**

Create `src/components/organisms/widgets/upcoming-bills.tsx`:

```tsx
"use client";

import Link from "next/link";
import { centsToDisplay } from "@/lib/money";
import type { BillRow } from "@/queries/recurring";

interface UpcomingBillsWidgetProps {
  data: BillRow[];
}

export function UpcomingBillsWidget({ data }: UpcomingBillsWidgetProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No upcoming bills
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 space-y-1">
        {data.map((bill) => (
          <div
            key={bill.id}
            className="flex items-center justify-between text-sm px-1 py-1"
          >
            <span className="truncate flex-1 min-w-0">{bill.name}</span>
            <span className="tabular-nums text-muted-foreground ml-2 shrink-0">
              {bill.averageAmount !== null
                ? centsToDisplay(bill.averageAmount)
                : "—"}
            </span>
            <span className="text-xs text-muted-foreground ml-3 w-16 text-right shrink-0">
              {bill.relativeDateLabel ?? "—"}
            </span>
          </div>
        ))}
      </div>
      <Link
        href="/bills"
        className="text-xs text-primary hover:underline mt-2 text-center"
      >
        View all bills
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/organisms/bill-list.tsx src/components/organisms/widgets/upcoming-bills.tsx
git commit -m "feat(phase9): add BillList organism + UpcomingBills dashboard widget"
```

---

## Task 8: Bills Page + Navigation

**Files:**
- Create: `src/app/(dashboard)/bills/page.tsx`
- Create: `src/app/(dashboard)/bills/loading.tsx`
- Create: `src/app/(dashboard)/bills/error.tsx`
- Modify: `src/components/organisms/sidebar-nav.tsx`

- [ ] **Step 1: Create Bills page**

Create `src/app/(dashboard)/bills/page.tsx`:

```tsx
import { getHouseholdId } from "@/lib/auth/session";
import { getUpcomingBills, getRecurringSummary } from "@/queries/recurring";
import { centsToDisplay } from "@/lib/money";
import { BillList } from "@/components/organisms/bill-list";
import { BillSearch } from "@/components/molecules/bill-search";
import { BillEmptyState } from "@/components/molecules/bill-empty-state";

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const householdId = await getHouseholdId();
  const params = await searchParams;
  const bills = getUpcomingBills(householdId, { search: params.q });
  const summary = getRecurringSummary(householdId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bills</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {summary.monthlyExpenses > 0 && (
              <span>
                {centsToDisplay(summary.monthlyExpenses)}/mo in recurring expenses
              </span>
            )}
            {summary.monthlyIncome > 0 && summary.monthlyExpenses > 0 && " · "}
            {summary.monthlyIncome > 0 && (
              <span>
                {centsToDisplay(summary.monthlyIncome)}/mo recurring income
              </span>
            )}
          </p>
        </div>
        {bills.length > 0 && <BillSearch />}
      </div>

      {bills.length === 0 ? <BillEmptyState /> : <BillList bills={bills} />}
    </div>
  );
}
```

- [ ] **Step 2: Create loading skeleton**

Create `src/app/(dashboard)/bills/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function BillsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create error boundary**

Create `src/app/(dashboard)/bills/error.tsx`:

```tsx
"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BillsError({
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
        {error.message || "Failed to load bills."}
      </p>
      <Button variant="outline" size="sm" onClick={reset} className="mt-4">
        Try Again
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Add Bills to sidebar navigation**

In `src/components/organisms/sidebar-nav.tsx`, add the `Receipt` import:

```typescript
import { LayoutDashboard, Building2, ArrowLeftRight, Wallet, Receipt, LogOut } from "lucide-react";
```

Add the Bills item to `NAV_ITEMS` after Budgets:

```typescript
const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Building2 },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/budgets", label: "Budgets", icon: Wallet },
  { href: "/bills", label: "Bills", icon: Receipt },
];
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/bills/ src/components/organisms/sidebar-nav.tsx
git commit -m "feat(phase9): add bills page, loading, error boundary, nav item"
```

---

## Task 9: Dashboard Widget Activation

**Files:**
- Modify: `src/components/organisms/widgets/registry.ts`
- Modify: `src/components/organisms/dashboard-grid.tsx`
- Modify: `src/queries/dashboard.ts`
- Modify: `src/app/(dashboard)/page.tsx`

- [ ] **Step 1: Activate bills widget in registry**

In `src/components/organisms/widgets/registry.ts`, change the bills entry (line 31) from:

```typescript
  { id: "bills", title: "Upcoming Bills", defaultSize: { w: 2, h: 1 }, isPlaceholder: true, placeholderText: "Coming in Phase 9" },
```

to:

```typescript
  { id: "bills", title: "Upcoming Bills", defaultSize: { w: 2, h: 1 } },
```

Update `getDefaultLayout()` to include the bills widget. Add to the desktop array:

```typescript
    { i: "bills", x: 0, y: 5, w: 2, h: 1 },
```

- [ ] **Step 2: Add `upcomingBills` to `DashboardData` and render widget**

In `src/components/organisms/dashboard-grid.tsx`:

Add import at top:

```typescript
import { UpcomingBillsWidget } from "./widgets/upcoming-bills";
import type { BillRow } from "@/queries/recurring";
```

Add `upcomingBills` to the `DashboardData` interface:

```typescript
export interface DashboardData {
  summary: DashboardSummary;
  netWorthHistory: NetWorthPoint[];
  monthlySpending: MonthlySpendingRow[];
  cashFlow: CashFlowRow[];
  recentTransactions: TransactionRow[];
  accounts: { id: string; name: string; type: AccountType; currentBalance: number | null; currency: string | null }[];
  upcomingBills: BillRow[];
}
```

Add the `case "bills"` in the `renderWidget` switch (before `default`):

```typescript
      case "bills":
        return <UpcomingBillsWidget data={data.upcomingBills} />;
```

- [ ] **Step 3: Fetch upcoming bills in dashboard queries**

In `src/queries/dashboard.ts`, add the import:

```typescript
import { getUpcomingBills, type BillRow } from "./recurring";
```

Export `BillRow` for re-use:

```typescript
export type { BillRow } from "./recurring";
```

- [ ] **Step 4: Include `upcomingBills` in dashboard page**

In `src/app/(dashboard)/page.tsx`, add the import:

```typescript
import { getUpcomingBills } from "@/queries/recurring";
```

Add to the `Promise.all` array (after `getAccounts`):

```typescript
  const [summary, netWorthHistory, monthlySpending, cashFlow, recentTransactions, allAccounts, upcomingBills] =
    await Promise.all([
      getDashboardSummary(householdId),
      getNetWorthHistory(householdId, "6M"),
      getMonthlySpending(householdId),
      getCashFlow(householdId, 6),
      getRecentTransactions(householdId, 5),
      getAccounts(householdId),
      getUpcomingBills(householdId, { limit: 5 }),
    ]);
```

Add to the `data` object:

```typescript
  const data: DashboardData = {
    summary,
    netWorthHistory,
    monthlySpending,
    cashFlow,
    recentTransactions,
    accounts,
    upcomingBills,
  };
```

- [ ] **Step 5: Commit**

```bash
git add src/components/organisms/widgets/registry.ts src/components/organisms/dashboard-grid.tsx src/queries/dashboard.ts src/app/\(dashboard\)/page.tsx
git commit -m "feat(phase9): activate upcoming bills dashboard widget"
```

---

## Task 10: Typecheck + Lint + Test All

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors. If there are circular import issues between `transactions.ts` and `recurring.ts`, remove the `.references()` on `recurringTransactionId` and keep it as a plain text column.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: No errors. Fix any unused imports or lint issues.

- [ ] **Step 3: Run all tests**

Run: `pnpm test`
Expected: All existing tests + new recurring tests pass.

- [ ] **Step 4: Fix any issues found, then commit**

```bash
git add -A
git commit -m "fix(phase9): address typecheck/lint/test issues"
```

---

## Task 11: Update BUILD_ORDER.md

**Files:**
- Modify: `docs/BUILD_ORDER.md`

- [ ] **Step 1: Update Phase 9 status and add implementation notes**

In `docs/BUILD_ORDER.md`, update the Phase 9 section from `**Status:** Not started` to `**Status:** Complete` and add implementation notes following the pattern of completed phases.

- [ ] **Step 2: Commit**

```bash
git add docs/BUILD_ORDER.md
git commit -m "docs: mark Phase 9 (recurring bills) complete in BUILD_ORDER"
```
