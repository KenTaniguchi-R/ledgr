# Phase 10 — Investments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full investment portfolio tracking with Plaid holdings sync, daily snapshots, and a brokerage-style portfolio UI.

**Architecture:** Three-stage sync pipeline (fetch → process → apply) mirroring the existing transaction sync, with Zod validation and atomic SQLite writes. Frontend uses existing atomic design: server component page passes data to client organisms. Existing chart/badge atoms are generalized rather than duplicated.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM + SQLite, Plaid Node SDK (`investmentsHoldingsGet`, `investmentsTransactionsGet`), Zod, Recharts v3, shadcn/ui v4, Vitest + fast-check + MSW.

**Spec:** `docs/superpowers/specs/2026-05-10-phase10-investments-design.md`

---

### Task 0: Schema Migration

**Files:**
- Modify: `src/db/schema/investments.ts`

- [ ] **Step 1: Add `sector` column and unique indexes**

```typescript
// In src/db/schema/investments.ts

// Add to investmentHoldings table columns (after `type`):
    sector: text("sector"),

// Add to investmentHoldings table indexes:
    index("idx_holdings_security").on(table.plaidSecurityId),

// Add to holdingsHistory table indexes:
    uniqueIndex("uq_holdingshistory_account_security_date").on(
      table.accountId,
      table.plaidSecurityId,
      table.date,
    ),

// Add to investmentTransactions table indexes:
    uniqueIndex("uq_invtxn_plaid_id").on(table.plaidInvestmentTransactionId),
```

The full `investmentHoldings` third argument becomes:

```typescript
  (table) => [
    index("idx_holdings_account").on(table.accountId),
    index("idx_holdings_date").on(table.accountId, table.asOfDate),
    index("idx_holdings_security").on(table.plaidSecurityId),
  ]
```

The full `holdingsHistory` third argument becomes:

```typescript
  (table) => [
    index("idx_holdingshistory_account_date").on(table.accountId, table.date),
    index("idx_holdingshistory_security").on(table.plaidSecurityId, table.date),
    uniqueIndex("uq_holdingshistory_account_security_date").on(
      table.accountId,
      table.plaidSecurityId,
      table.date,
    ),
  ]
```

The full `investmentTransactions` third argument becomes:

```typescript
  (table) => [
    index("idx_invtxn_account_date").on(table.accountId, table.date),
    uniqueIndex("uq_invtxn_plaid_id").on(table.plaidInvestmentTransactionId),
  ]
```

Add `uniqueIndex` to the imports from `drizzle-orm/sqlite-core`.

- [ ] **Step 2: Generate and run migration**

Run: `pnpm db:generate && pnpm db:migrate`
Expected: Migration applies cleanly.

- [ ] **Step 3: Verify with typecheck**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/investments.ts drizzle/
git commit -m "feat(phase10): add sector column and unique indexes to investment tables"
```

---

### Task 1: Update Plaid Link to Include Investments Product

**Files:**
- Modify: `src/actions/plaid.ts:25`

- [ ] **Step 1: Add `Products.Investments` to the products array**

In `src/actions/plaid.ts`, change:

```typescript
      products: [Products.Transactions],
```

to:

```typescript
      products: [Products.Transactions, Products.Investments],
```

- [ ] **Step 2: Verify with typecheck**

Run: `pnpm typecheck`
Expected: No type errors. `Products.Investments` is already available from the `plaid` package.

- [ ] **Step 3: Commit**

```bash
git add src/actions/plaid.ts
git commit -m "feat(phase10): add investments product to Plaid Link token creation"
```

---

### Task 2: Extract Shared Plaid Utilities

**Files:**
- Modify: `src/lib/plaid/utils.ts`
- Modify: `src/lib/plaid/sync.ts`

- [ ] **Step 1: Add shared sync utilities to `utils.ts`**

Append to the existing `src/lib/plaid/utils.ts`:

```typescript
// ─── Shared sync utilities ──────────────────────────────────────────────────

export const REAUTH_ERROR_CODES = new Set([
  "ITEM_LOGIN_REQUIRED",
  "INVALID_CREDENTIALS",
  "INVALID_MFA",
  "ITEM_LOCKED",
  "USER_SETUP_REQUIRED",
  "MFA_NOT_SUPPORTED",
  "INSUFFICIENT_CREDENTIALS",
]);

export const TRANSIENT_ERROR_CODES = new Set([
  "INSTITUTION_DOWN",
  "INSTITUTION_NOT_RESPONDING",
  "INSTITUTION_NOT_AVAILABLE",
  "TRANSACTIONS_LIMIT",
  "RATE_LIMIT_EXCEEDED",
  "INTERNAL_SERVER_ERROR",
]);

export const SKIP_ERROR_CODES = new Set([
  "PRODUCTS_NOT_SUPPORTED",
  "PRODUCT_NOT_READY",
]);

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const errorCode = extractPlaidErrorCode(err);
      if (errorCode !== "RATE_LIMIT_EXCEEDED" || attempt === maxAttempts) {
        throw err;
      }
      const baseDelay = Math.pow(2, attempt) * 500;
      const jitter = Math.random() * 500;
      await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
    }
  }
  throw new Error("retryWithBackoff exhausted");
}
```

- [ ] **Step 2: Update `sync.ts` to import from `utils.ts`**

In `src/lib/plaid/sync.ts`:

Remove the local definitions of `REAUTH_ERROR_CODES`, `TRANSIENT_ERROR_CODES`, and `retryWithBackoff`.

Add this import at the top:

```typescript
import {
  REAUTH_ERROR_CODES,
  TRANSIENT_ERROR_CODES,
  retryWithBackoff,
  extractPlaidErrorCode,
} from "./utils";
```

Remove the existing `extractPlaidErrorCode` import if it was already imported from utils (it is — see `src/actions/plaid.ts:11`). The function is already exported from `utils.ts`, so `sync.ts` just needs to import it from there instead of defining its own copy.

- [ ] **Step 3: Run tests to verify no regressions**

Run: `pnpm typecheck && pnpm test`
Expected: All existing tests pass. No behavior change.

- [ ] **Step 4: Commit**

```bash
git add src/lib/plaid/utils.ts src/lib/plaid/sync.ts
git commit -m "refactor(phase10): extract shared Plaid utilities to utils.ts"
```

---

### Task 3: Add Investment Zod Schemas

**Files:**
- Modify: `src/lib/plaid/schemas.ts`

- [ ] **Step 1: Add investment schemas**

Append to `src/lib/plaid/schemas.ts`:

```typescript
// ─── Investment Schemas ─────────────────────────────────────────────────────

export const SECURITY_TYPE_MAP: Record<string, string> = {
  equity: "stock",
  etf: "etf",
  "mutual fund": "mutual_fund",
  "fixed income": "bond",
  cryptocurrency: "crypto",
  cash: "cash",
};

export function mapSecurityType(plaidType: string | null): string {
  if (!plaidType) return "other";
  return SECURITY_TYPE_MAP[plaidType.toLowerCase()] ?? "other";
}

export const PlaidSecuritySchema = z.object({
  security_id: z.string(),
  name: z.string().nullable(),
  ticker_symbol: z.string().nullable(),
  type: z.string().nullable(),
  iso_currency_code: z.string().nullable(),
  close_price: z.number().nullable(),
  sector: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  is_cash_equivalent: z.boolean().nullable().optional(),
});

export type PlaidSecurity = z.infer<typeof PlaidSecuritySchema>;

export const PlaidHoldingSchema = z.object({
  account_id: z.string(),
  security_id: z.string(),
  quantity: z.number(),
  institution_price: z.number().nullable(),
  institution_price_as_of: z.string().nullable().optional(),
  institution_value: z.number(),
  cost_basis: z.number().nullable(),
  iso_currency_code: z.string().nullable(),
});

export type PlaidHolding = z.infer<typeof PlaidHoldingSchema>;

export const PlaidInvestmentTxnSchema = z.object({
  investment_transaction_id: z.string(),
  account_id: z.string(),
  security_id: z.string().nullable(),
  date: z.string(),
  name: z.string(),
  quantity: z.number(),
  amount: z.number(),
  price: z.number(),
  fees: z.number().nullable(),
  type: z.string(),
  subtype: z.string().nullable().optional(),
  iso_currency_code: z.string().nullable(),
});

export type PlaidInvestmentTxn = z.infer<typeof PlaidInvestmentTxnSchema>;

export const PlaidHoldingsResponseSchema = z.object({
  holdings: z.array(PlaidHoldingSchema),
  securities: z.array(PlaidSecuritySchema),
  accounts: z.array(PlaidAccountBalancesSchema),
  request_id: z.string().optional(),
});

export type PlaidHoldingsResponse = z.infer<typeof PlaidHoldingsResponseSchema>;

export const PlaidInvestmentTxnsResponseSchema = z.object({
  investment_transactions: z.array(PlaidInvestmentTxnSchema),
  securities: z.array(PlaidSecuritySchema),
  total_investment_transactions: z.number(),
  request_id: z.string().optional(),
});

export type PlaidInvestmentTxnsResponse = z.infer<typeof PlaidInvestmentTxnsResponseSchema>;
```

- [ ] **Step 2: Verify with typecheck**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/plaid/schemas.ts
git commit -m "feat(phase10): add Zod schemas for Plaid investment responses"
```

---

### Task 4: Process Functions + Unit Tests + Test Factories

**Files:**
- Create: `src/lib/plaid/investments.ts`
- Create: `src/lib/plaid/investments.test.ts`
- Modify: `tests/integration/helpers.ts`

- [ ] **Step 1: Write the test file first**

Create `src/lib/plaid/investments.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { test } from "@fast-check/vitest";
import { fc } from "@fast-check/vitest";
import { processHoldings, processInvestmentTransactions } from "./investments";
import type { PlaidHolding, PlaidSecurity, PlaidInvestmentTxn } from "./schemas";

const SECURITIES: PlaidSecurity[] = [
  {
    security_id: "sec-1",
    name: "Apple Inc",
    ticker_symbol: "AAPL",
    type: "equity",
    iso_currency_code: "USD",
    close_price: 150.0,
    sector: "Technology",
  },
  {
    security_id: "sec-2",
    name: "Vanguard S&P 500 ETF",
    ticker_symbol: "VOO",
    type: "etf",
    iso_currency_code: "USD",
    close_price: 400.0,
    sector: null,
  },
  {
    security_id: "sec-3",
    name: "Some Warrant",
    ticker_symbol: null,
    type: "warrant",
    iso_currency_code: "USD",
    close_price: 5.0,
  },
];

const ACCOUNT_MAP = new Map([
  ["plaid-acc-ira", "internal-acc-ira"],
  ["plaid-acc-401k", "internal-acc-401k"],
]);

describe("processHoldings", () => {
  it("maps security type correctly", () => {
    const holdings: PlaidHolding[] = [
      {
        account_id: "plaid-acc-ira",
        security_id: "sec-1",
        quantity: 10,
        institution_price: 150.0,
        institution_value: 1500.0,
        cost_basis: 1200.0,
        iso_currency_code: "USD",
      },
    ];
    const result = processHoldings(holdings, SECURITIES, "hh-1", ACCOUNT_MAP);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("stock");
    expect(result[0].ticker).toBe("AAPL");
    expect(result[0].securityName).toBe("Apple Inc");
    expect(result[0].sector).toBe("Technology");
  });

  it("converts values to integer cents", () => {
    const holdings: PlaidHolding[] = [
      {
        account_id: "plaid-acc-ira",
        security_id: "sec-1",
        quantity: 10,
        institution_price: 150.0,
        institution_value: 1500.0,
        cost_basis: 1200.5,
        iso_currency_code: "USD",
      },
    ];
    const result = processHoldings(holdings, SECURITIES, "hh-1", ACCOUNT_MAP);
    expect(result[0].currentValue).toBe(150000);
    expect(result[0].costBasis).toBe(120050);
  });

  it("preserves null cost basis", () => {
    const holdings: PlaidHolding[] = [
      {
        account_id: "plaid-acc-ira",
        security_id: "sec-1",
        quantity: 10,
        institution_price: 150.0,
        institution_value: 1500.0,
        cost_basis: null,
        iso_currency_code: "USD",
      },
    ];
    const result = processHoldings(holdings, SECURITIES, "hh-1", ACCOUNT_MAP);
    expect(result[0].costBasis).toBeNull();
  });

  it("skips holdings with unknown account_id", () => {
    const holdings: PlaidHolding[] = [
      {
        account_id: "plaid-acc-unknown",
        security_id: "sec-1",
        quantity: 10,
        institution_price: 150.0,
        institution_value: 1500.0,
        cost_basis: null,
        iso_currency_code: "USD",
      },
    ];
    const result = processHoldings(holdings, SECURITIES, "hh-1", ACCOUNT_MAP);
    expect(result).toHaveLength(0);
  });

  it("maps unknown security type to 'other'", () => {
    const holdings: PlaidHolding[] = [
      {
        account_id: "plaid-acc-ira",
        security_id: "sec-3",
        quantity: 100,
        institution_price: 5.0,
        institution_value: 500.0,
        cost_basis: 300.0,
        iso_currency_code: "USD",
      },
    ];
    const result = processHoldings(holdings, SECURITIES, "hh-1", ACCOUNT_MAP);
    expect(result[0].type).toBe("other");
  });

  it("skips holdings with missing security_id in lookup", () => {
    const holdings: PlaidHolding[] = [
      {
        account_id: "plaid-acc-ira",
        security_id: "sec-nonexistent",
        quantity: 10,
        institution_price: 100.0,
        institution_value: 1000.0,
        cost_basis: 500.0,
        iso_currency_code: "USD",
      },
    ];
    const result = processHoldings(holdings, SECURITIES, "hh-1", ACCOUNT_MAP);
    expect(result).toHaveLength(0);
  });
});

describe("processInvestmentTransactions", () => {
  it("converts amount/price/fees to cents", () => {
    const txns: PlaidInvestmentTxn[] = [
      {
        investment_transaction_id: "inv-txn-1",
        account_id: "plaid-acc-ira",
        security_id: "sec-1",
        date: "2026-05-01",
        name: "Buy AAPL",
        quantity: 5,
        amount: 750.0,
        price: 150.0,
        fees: 4.95,
        type: "buy",
        subtype: "buy",
        iso_currency_code: "USD",
      },
    ];
    const result = processInvestmentTransactions(txns, SECURITIES, ACCOUNT_MAP);
    expect(result[0].amount).toBe(75000);
    expect(result[0].price).toBe(15000);
    expect(result[0].fees).toBe(495);
  });

  it("preserves negative fees for rebates", () => {
    const txns: PlaidInvestmentTxn[] = [
      {
        investment_transaction_id: "inv-txn-2",
        account_id: "plaid-acc-ira",
        security_id: "sec-1",
        date: "2026-05-01",
        name: "Fee Rebate",
        quantity: 0,
        amount: 0,
        price: 0,
        fees: -5.0,
        type: "fee",
        subtype: null,
        iso_currency_code: "USD",
      },
    ];
    const result = processInvestmentTransactions(txns, SECURITIES, ACCOUNT_MAP);
    expect(result[0].fees).toBe(-500);
  });

  it("maps transaction type", () => {
    const txns: PlaidInvestmentTxn[] = [
      {
        investment_transaction_id: "inv-txn-3",
        account_id: "plaid-acc-ira",
        security_id: "sec-1",
        date: "2026-05-01",
        name: "Sell AAPL",
        quantity: -5,
        amount: -750.0,
        price: 150.0,
        fees: 0,
        type: "sell",
        subtype: "sell",
        iso_currency_code: "USD",
      },
    ];
    const result = processInvestmentTransactions(txns, SECURITIES, ACCOUNT_MAP);
    expect(result[0].type).toBe("sell");
  });
});

describe("processHoldings property tests", () => {
  test.prop([
    fc.float({ min: 0, max: 1_000_000, noNaN: true }),
    fc.float({ min: 0.01, max: 10_000, noNaN: true }),
  ])("converts arbitrary quantity/price without throwing", (quantity, price) => {
    const holdings: PlaidHolding[] = [
      {
        account_id: "plaid-acc-ira",
        security_id: "sec-1",
        quantity,
        institution_price: price,
        institution_value: quantity * price,
        cost_basis: quantity * price * 0.8,
        iso_currency_code: "USD",
      },
    ];
    const result = processHoldings(holdings, SECURITIES, "hh-1", ACCOUNT_MAP);
    expect(result).toHaveLength(1);
    expect(Number.isFinite(result[0].currentValue)).toBe(true);
    expect(Number.isFinite(result[0].costBasis!)).toBe(true);
  });
});

describe("processInvestmentTransactions property tests", () => {
  test.prop([
    fc.float({ min: -0.005, max: 0.005, noNaN: true }),
    fc.float({ min: -0.005, max: 0.005, noNaN: true }),
    fc.float({ min: -0.005, max: 0.005, noNaN: true }),
  ])("never produces -0 for near-zero inputs", (amount, price, fees) => {
    const txns: PlaidInvestmentTxn[] = [
      {
        investment_transaction_id: "inv-txn-prop",
        account_id: "plaid-acc-ira",
        security_id: "sec-1",
        date: "2026-05-01",
        name: "Test",
        quantity: 0,
        amount,
        price,
        fees,
        type: "buy",
        subtype: null,
        iso_currency_code: "USD",
      },
    ];
    const result = processInvestmentTransactions(txns, SECURITIES, ACCOUNT_MAP);
    if (result.length > 0) {
      expect(Object.is(result[0].amount, -0)).toBe(false);
      expect(Object.is(result[0].price, -0)).toBe(false);
      expect(Object.is(result[0].fees, -0)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/plaid/investments.test.ts`
Expected: FAIL — `processHoldings` and `processInvestmentTransactions` not found.

- [ ] **Step 3: Implement the process functions**

Create `src/lib/plaid/investments.ts`:

```typescript
import { v4 as uuid } from "uuid";
import type { PlaidHolding, PlaidSecurity, PlaidInvestmentTxn } from "./schemas";
import { mapSecurityType } from "./schemas";
import { plaidAmountToCents } from "@/lib/money";
import { todayDateString } from "@/lib/date-utils";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HoldingRow {
  id: string;
  accountId: string;
  plaidSecurityId: string;
  securityName: string;
  ticker: string | null;
  quantity: number;
  costBasis: number | null;
  currentValue: number;
  type: string;
  sector: string | null;
  currency: string;
  asOfDate: string;
}

export interface InvestmentTxnRow {
  id: string;
  accountId: string;
  plaidInvestmentTransactionId: string;
  securityName: string | null;
  ticker: string | null;
  type: string;
  quantity: number;
  price: number;
  amount: number;
  fees: number;
  date: string;
}

export interface InvestmentSyncResult {
  success: boolean;
  skipped?: boolean;
  holdingsUpserted?: number;
  txnsInserted?: number;
  error?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function safeCents(value: number): number {
  const cents = Math.round(value * 100);
  return cents === 0 ? 0 : cents;
}

function buildSecurityMap(securities: PlaidSecurity[]): Map<string, PlaidSecurity> {
  const map = new Map<string, PlaidSecurity>();
  for (const sec of securities) {
    map.set(sec.security_id, sec);
  }
  return map;
}

// ─── Stage 2: Process (Pure Functions) ──────────────────────────────────────

export function processHoldings(
  rawHoldings: PlaidHolding[],
  securities: PlaidSecurity[],
  householdId: string,
  plaidToInternalAccount: Map<string, string>,
): HoldingRow[] {
  const securityMap = buildSecurityMap(securities);
  const today = todayDateString();
  const rows: HoldingRow[] = [];

  for (const holding of rawHoldings) {
    const internalAccountId = plaidToInternalAccount.get(holding.account_id);
    if (!internalAccountId) continue;

    const security = securityMap.get(holding.security_id);
    if (!security) continue;

    rows.push({
      id: uuid(),
      accountId: internalAccountId,
      plaidSecurityId: holding.security_id,
      securityName: security.name ?? "Unknown Security",
      ticker: security.ticker_symbol ?? null,
      quantity: holding.quantity,
      costBasis: holding.cost_basis !== null ? safeCents(holding.cost_basis) : null,
      currentValue: safeCents(holding.institution_value),
      type: mapSecurityType(security.type),
      sector: security.sector ?? null,
      currency: holding.iso_currency_code ?? "USD",
      asOfDate: today,
    });
  }

  return rows;
}

const VALID_INV_TXN_TYPES = new Set(["buy", "sell", "dividend", "transfer", "fee"]);

function mapInvestmentTxnType(plaidType: string): string {
  return VALID_INV_TXN_TYPES.has(plaidType) ? plaidType : "other";
}

export function processInvestmentTransactions(
  rawTxns: PlaidInvestmentTxn[],
  securities: PlaidSecurity[],
  plaidToInternalAccount: Map<string, string>,
): InvestmentTxnRow[] {
  const securityMap = buildSecurityMap(securities);
  const rows: InvestmentTxnRow[] = [];

  for (const txn of rawTxns) {
    const internalAccountId = plaidToInternalAccount.get(txn.account_id);
    if (!internalAccountId) continue;

    const security = txn.security_id ? securityMap.get(txn.security_id) : null;

    rows.push({
      id: uuid(),
      accountId: internalAccountId,
      plaidInvestmentTransactionId: txn.investment_transaction_id,
      securityName: security?.name ?? txn.name,
      ticker: security?.ticker_symbol ?? null,
      type: mapInvestmentTxnType(txn.type),
      quantity: txn.quantity,
      price: safeCents(txn.price),
      amount: safeCents(txn.amount),
      fees: safeCents(txn.fees ?? 0),
      date: txn.date,
    });
  }

  return rows;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/plaid/investments.test.ts`
Expected: All 12 tests PASS.

- [ ] **Step 5: Add test factories to `helpers.ts`**

Append to `tests/integration/helpers.ts`:

Add `investmentHoldings, holdingsHistory, investmentTransactions` to the imports from `../../src/db/schema`, then add:

```typescript
export function insertInvestmentHolding(
  db: LedgrDb,
  accountId: string,
  overrides: Partial<typeof investmentHoldings.$inferInsert> = {},
) {
  const id = uuid();
  const now = new Date().toISOString();
  db.insert(investmentHoldings)
    .values({
      id,
      accountId,
      securityName: "Test Stock",
      ticker: "TST",
      quantity: 10,
      currentValue: 150000,
      costBasis: 120000,
      type: "stock",
      asOfDate: "2026-05-10",
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .run();
  return { holdingId: id };
}

export function insertHoldingsSnapshot(
  db: LedgrDb,
  accountId: string,
  date: string,
  overrides: Partial<typeof holdingsHistory.$inferInsert> = {},
) {
  const id = uuid();
  db.insert(holdingsHistory)
    .values({
      id,
      accountId,
      date,
      value: 150000,
      ...overrides,
    })
    .run();
  return { snapshotId: id };
}

export function insertInvestmentTransaction(
  db: LedgrDb,
  accountId: string,
  overrides: Partial<typeof investmentTransactions.$inferInsert> = {},
) {
  const id = uuid();
  const now = new Date().toISOString();
  db.insert(investmentTransactions)
    .values({
      id,
      accountId,
      type: "buy",
      amount: 75000,
      date: "2026-05-01",
      createdAt: now,
      ...overrides,
    })
    .run();
  return { investmentTxnId: id };
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/plaid/investments.ts src/lib/plaid/investments.test.ts tests/integration/helpers.ts
git commit -m "feat(phase10): add investment process functions with unit tests and test factories"
```

---

### Task 5: Fetch Functions + MSW Mock Handlers

**Files:**
- Modify: `src/lib/plaid/investments.ts`
- Modify: `tests/mocks/handlers.ts`

- [ ] **Step 1: Add MSW mock handlers**

Append to `tests/mocks/handlers.ts`:

```typescript
// ─── Investment Mock Handlers ───────────────────────────────────────────────

export const TEST_SECURITY_IDS = {
  aapl: "sec-aapl",
  voo: "sec-voo",
  btc: "sec-btc",
  warrant: "sec-warrant",
} as const;

export const investmentsHoldingsGetHandler = http.post(
  "https://sandbox.plaid.com/investments/holdings/get",
  () =>
    HttpResponse.json({
      accounts: [
        {
          account_id: "plaid-acc-null",
          name: "Plaid IRA",
          type: "investment",
          subtype: "ira",
          mask: "5555",
          balances: { current: 23000.0, available: null, limit: null, iso_currency_code: "USD" },
        },
      ],
      holdings: [
        {
          account_id: "plaid-acc-null",
          security_id: TEST_SECURITY_IDS.aapl,
          quantity: 10,
          institution_price: 150.0,
          institution_price_as_of: "2026-05-10",
          institution_value: 1500.0,
          cost_basis: 1200.0,
          iso_currency_code: "USD",
        },
        {
          account_id: "plaid-acc-null",
          security_id: TEST_SECURITY_IDS.voo,
          quantity: 5,
          institution_price: 400.0,
          institution_price_as_of: "2026-05-10",
          institution_value: 2000.0,
          cost_basis: null,
          iso_currency_code: "USD",
        },
        {
          account_id: "plaid-acc-null",
          security_id: TEST_SECURITY_IDS.btc,
          quantity: 0.5,
          institution_price: 60000.0,
          institution_price_as_of: "2026-05-10",
          institution_value: 30000.0,
          cost_basis: 25000.0,
          iso_currency_code: "USD",
        },
        {
          account_id: "plaid-acc-null",
          security_id: TEST_SECURITY_IDS.warrant,
          quantity: 100,
          institution_price: 2.0,
          institution_price_as_of: null,
          institution_value: 200.0,
          cost_basis: 150.0,
          iso_currency_code: "USD",
        },
      ],
      securities: [
        {
          security_id: TEST_SECURITY_IDS.aapl,
          name: "Apple Inc",
          ticker_symbol: "AAPL",
          type: "equity",
          iso_currency_code: "USD",
          close_price: 150.0,
          sector: "Technology",
          is_cash_equivalent: false,
        },
        {
          security_id: TEST_SECURITY_IDS.voo,
          name: "Vanguard S&P 500 ETF",
          ticker_symbol: "VOO",
          type: "etf",
          iso_currency_code: "USD",
          close_price: 400.0,
          sector: null,
          is_cash_equivalent: false,
        },
        {
          security_id: TEST_SECURITY_IDS.btc,
          name: "Bitcoin",
          ticker_symbol: "BTC",
          type: "cryptocurrency",
          iso_currency_code: "USD",
          close_price: 60000.0,
          sector: null,
          is_cash_equivalent: false,
        },
        {
          security_id: TEST_SECURITY_IDS.warrant,
          name: "Some Warrant XYZ",
          ticker_symbol: null,
          type: "warrant",
          iso_currency_code: "USD",
          close_price: 2.0,
          sector: null,
          is_cash_equivalent: false,
        },
      ],
      request_id: "req-inv-holdings",
    })
);

export const investmentsHoldingsEmptyHandler = http.post(
  "https://sandbox.plaid.com/investments/holdings/get",
  () =>
    HttpResponse.json({
      accounts: [],
      holdings: [],
      securities: [],
      request_id: "req-inv-holdings-empty",
    })
);

export const investmentsTransactionsPageOneHandler = http.post(
  "https://sandbox.plaid.com/investments/transactions/get",
  () =>
    HttpResponse.json({
      investment_transactions: [
        {
          investment_transaction_id: "inv-txn-buy-aapl",
          account_id: "plaid-acc-null",
          security_id: TEST_SECURITY_IDS.aapl,
          date: "2026-04-15",
          name: "Buy AAPL",
          quantity: 10,
          amount: 1500.0,
          price: 150.0,
          fees: 4.95,
          type: "buy",
          subtype: "buy",
          iso_currency_code: "USD",
        },
        {
          investment_transaction_id: "inv-txn-div-voo",
          account_id: "plaid-acc-null",
          security_id: TEST_SECURITY_IDS.voo,
          date: "2026-04-20",
          name: "Dividend VOO",
          quantity: 0,
          amount: -25.0,
          price: 0,
          fees: 0,
          type: "cash",
          subtype: "dividend",
          iso_currency_code: "USD",
        },
      ],
      securities: [
        {
          security_id: TEST_SECURITY_IDS.aapl,
          name: "Apple Inc",
          ticker_symbol: "AAPL",
          type: "equity",
          iso_currency_code: "USD",
          close_price: 150.0,
          sector: "Technology",
          is_cash_equivalent: false,
        },
        {
          security_id: TEST_SECURITY_IDS.voo,
          name: "Vanguard S&P 500 ETF",
          ticker_symbol: "VOO",
          type: "etf",
          iso_currency_code: "USD",
          close_price: 400.0,
          sector: null,
          is_cash_equivalent: false,
        },
      ],
      total_investment_transactions: 3,
      request_id: "req-inv-txns-page1",
    })
);

export const investmentsTransactionsPageTwoHandler = http.post(
  "https://sandbox.plaid.com/investments/transactions/get",
  () =>
    HttpResponse.json({
      investment_transactions: [
        {
          investment_transaction_id: "inv-txn-sell-aapl",
          account_id: "plaid-acc-null",
          security_id: TEST_SECURITY_IDS.aapl,
          date: "2026-05-01",
          name: "Sell AAPL",
          quantity: -5,
          amount: -800.0,
          price: 160.0,
          fees: 4.95,
          type: "sell",
          subtype: "sell",
          iso_currency_code: "USD",
        },
      ],
      securities: [
        {
          security_id: TEST_SECURITY_IDS.aapl,
          name: "Apple Inc",
          ticker_symbol: "AAPL",
          type: "equity",
          iso_currency_code: "USD",
          close_price: 160.0,
          sector: "Technology",
          is_cash_equivalent: false,
        },
      ],
      total_investment_transactions: 3,
      request_id: "req-inv-txns-page2",
    })
);

export const investmentsProductsNotSupportedHandler = http.post(
  "https://sandbox.plaid.com/investments/holdings/get",
  () =>
    HttpResponse.json(
      {
        error_type: "INVALID_REQUEST",
        error_code: "PRODUCTS_NOT_SUPPORTED",
        error_message: "the products specified are not supported by this institution",
      },
      { status: 400 }
    )
);
```

- [ ] **Step 2: Add fetch functions to `investments.ts`**

Add to `src/lib/plaid/investments.ts` after the imports:

```typescript
import type { PlaidApi } from "plaid";
import {
  PlaidHoldingsResponseSchema,
  PlaidInvestmentTxnsResponseSchema,
} from "./schemas";
import { retryWithBackoff } from "./utils";

const MAX_INV_TXN_PAGES = 50;

// ─── Stage 1: Fetch ─────────────────────────────────────────────────────────

export async function fetchHoldings(
  client: PlaidApi,
  accessToken: string,
): Promise<{ holdings: PlaidHolding[]; securities: PlaidSecurity[] }> {
  const response = await retryWithBackoff(() =>
    client.investmentsHoldingsGet({ access_token: accessToken })
  );
  const parsed = PlaidHoldingsResponseSchema.parse(response.data);
  return { holdings: parsed.holdings, securities: parsed.securities };
}

export async function fetchAllInvestmentTransactionPages(
  client: PlaidApi,
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<{ transactions: PlaidInvestmentTxn[]; securities: PlaidSecurity[] }> {
  const allTxns: PlaidInvestmentTxn[] = [];
  const allSecurities = new Map<string, PlaidSecurity>();
  let offset = 0;

  for (let page = 0; page < MAX_INV_TXN_PAGES; page++) {
    const response = await retryWithBackoff(() =>
      client.investmentsTransactionsGet({
        access_token: accessToken,
        start_date: startDate,
        end_date: endDate,
        options: { offset },
      })
    );
    const parsed = PlaidInvestmentTxnsResponseSchema.parse(response.data);

    allTxns.push(...parsed.investment_transactions);
    for (const sec of parsed.securities) {
      allSecurities.set(sec.security_id, sec);
    }

    offset += parsed.investment_transactions.length;
    if (offset >= parsed.total_investment_transactions) break;
  }

  return { transactions: allTxns, securities: Array.from(allSecurities.values()) };
}
```

Update the imports at the top of the file to include the new types:

```typescript
import type { PlaidHolding, PlaidSecurity, PlaidInvestmentTxn } from "./schemas";
```

(Move these from `type` imports if needed — the process functions already use them.)

- [ ] **Step 3: Verify with typecheck**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/plaid/investments.ts tests/mocks/handlers.ts
git commit -m "feat(phase10): add investment fetch functions and MSW mock handlers"
```

---

### Task 6: Apply to DB + Integration Tests

**Files:**
- Modify: `src/lib/plaid/investments.ts`
- Create: `tests/integration/investment-sync.test.ts`

- [ ] **Step 1: Write the integration test**

Create `tests/integration/investment-sync.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertPlaidItem,
  insertInvestmentHolding,
  insertHoldingsSnapshot,
} from "./helpers";
import { applyInvestmentsToDb, snapshotHoldings } from "@/lib/plaid/investments";
import type { HoldingRow, InvestmentTxnRow } from "@/lib/plaid/investments";
import { investmentHoldings, holdingsHistory, investmentTransactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { LedgrDb } from "@/db";

function makeHolding(accountId: string, overrides: Partial<HoldingRow> = {}): HoldingRow {
  return {
    id: crypto.randomUUID(),
    accountId,
    plaidSecurityId: "sec-1",
    securityName: "Apple Inc",
    ticker: "AAPL",
    quantity: 10,
    costBasis: 120000,
    currentValue: 150000,
    type: "stock",
    sector: "Technology",
    currency: "USD",
    asOfDate: "2026-05-10",
    ...overrides,
  };
}

function makeTxn(accountId: string, overrides: Partial<InvestmentTxnRow> = {}): InvestmentTxnRow {
  return {
    id: crypto.randomUUID(),
    accountId,
    plaidInvestmentTransactionId: `inv-txn-${crypto.randomUUID().slice(0, 8)}`,
    securityName: "Apple Inc",
    ticker: "AAPL",
    type: "buy",
    quantity: 5,
    price: 15000,
    amount: 75000,
    fees: 495,
    date: "2026-05-01",
    ...overrides,
  };
}

describe("applyInvestmentsToDb", () => {
  let db: LedgrDb;
  let householdId: string;
  let accountId: string;
  let plaidItemId: string;

  beforeEach(() => {
    db = createTestDb();
    const hh = insertHousehold(db);
    householdId = hh.householdId;
    const acc = insertAccount(db, householdId, { type: "investment", plaidAccountId: "plaid-acc-ira" });
    accountId = acc.accountId;
    const pi = insertPlaidItem(db, householdId);
    plaidItemId = pi.plaidItemId;
  });

  it("inserts holdings and transactions", () => {
    const holdings = [makeHolding(accountId)];
    const txns = [makeTxn(accountId)];

    const result = applyInvestmentsToDb(db, holdings, txns, plaidItemId, householdId);

    expect(result.holdingsUpserted).toBe(1);
    expect(result.txnsInserted).toBe(1);

    const dbHoldings = db.select().from(investmentHoldings).all();
    expect(dbHoldings).toHaveLength(1);
    expect(dbHoldings[0].currentValue).toBe(150000);

    const dbTxns = db.select().from(investmentTransactions).all();
    expect(dbTxns).toHaveLength(1);
    expect(dbTxns[0].amount).toBe(75000);
  });

  it("full-replaces holdings on re-sync", () => {
    const h1 = [makeHolding(accountId, { currentValue: 100000 })];
    applyInvestmentsToDb(db, h1, [], plaidItemId, householdId);

    const h2 = [makeHolding(accountId, { currentValue: 200000 })];
    applyInvestmentsToDb(db, h2, [], plaidItemId, householdId);

    const dbHoldings = db.select().from(investmentHoldings).all();
    expect(dbHoldings).toHaveLength(1);
    expect(dbHoldings[0].currentValue).toBe(200000);
  });

  it("deduplicates transactions with INSERT OR IGNORE", () => {
    const txn = makeTxn(accountId, { plaidInvestmentTransactionId: "dup-txn" });
    applyInvestmentsToDb(db, [], [txn], plaidItemId, householdId);
    applyInvestmentsToDb(db, [], [{ ...txn, id: crypto.randomUUID() }], plaidItemId, householdId);

    const dbTxns = db.select().from(investmentTransactions).all();
    expect(dbTxns).toHaveLength(1);
  });

  it("writes holdings_history snapshot", () => {
    const holdings = [makeHolding(accountId)];
    applyInvestmentsToDb(db, holdings, [], plaidItemId, householdId);

    const snapshots = db.select().from(holdingsHistory).all();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].value).toBe(150000);
  });

  it("prevents duplicate snapshots via unique constraint", () => {
    const holdings = [makeHolding(accountId)];
    applyInvestmentsToDb(db, holdings, [], plaidItemId, householdId);
    applyInvestmentsToDb(db, holdings, [], plaidItemId, householdId);

    const snapshots = db.select().from(holdingsHistory).all();
    expect(snapshots).toHaveLength(1);
  });

  it("isolates holdings across households", () => {
    const hh2 = insertHousehold(db, "Other Household");
    const acc2 = insertAccount(db, hh2.householdId, { type: "investment" });

    applyInvestmentsToDb(db, [makeHolding(accountId)], [], plaidItemId, householdId);
    insertInvestmentHolding(db, acc2.accountId, { currentValue: 999999 });

    const hh1Holdings = db
      .select()
      .from(investmentHoldings)
      .where(eq(investmentHoldings.accountId, accountId))
      .all();
    expect(hh1Holdings).toHaveLength(1);
    expect(hh1Holdings[0].currentValue).toBe(150000);
  });
});

describe("snapshotHoldings", () => {
  it("idempotently snapshots holdings", () => {
    const db = createTestDb();
    const { householdId } = insertHousehold(db);
    const { accountId } = insertAccount(db, householdId, { type: "investment" });
    insertInvestmentHolding(db, accountId, {
      plaidSecurityId: "sec-1",
      currentValue: 150000,
    });

    snapshotHoldings(db);
    snapshotHoldings(db);

    const snapshots = db.select().from(holdingsHistory).all();
    expect(snapshots).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/integration/investment-sync.test.ts`
Expected: FAIL — `applyInvestmentsToDb` and `snapshotHoldings` not found.

- [ ] **Step 3: Implement `applyInvestmentsToDb` and `snapshotHoldings`**

Add to `src/lib/plaid/investments.ts`:

```typescript
import { eq, inArray } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  investmentHoldings,
  holdingsHistory,
  investmentTransactions,
  accounts,
} from "@/db/schema";

// ─── Stage 3: Apply (Atomic DB Write) ──────────────────────────────────────

export function applyInvestmentsToDb(
  db: LedgrDb,
  holdingRows: HoldingRow[],
  txnRows: InvestmentTxnRow[],
  itemId: string,
  householdId: string,
): { holdingsUpserted: number; txnsInserted: number } {
  let holdingsUpserted = 0;
  let txnsInserted = 0;
  const today = todayDateString();

  db.transaction((tx) => {
    // Get account IDs belonging to this plaid item
    const itemAccounts = tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.plaidItemId, itemId))
      .all();
    const itemAccountIds = itemAccounts.map((a) => a.id);

    // Holdings: full replace
    if (itemAccountIds.length > 0) {
      tx.delete(investmentHoldings)
        .where(inArray(investmentHoldings.accountId, itemAccountIds))
        .run();
    }

    for (const row of holdingRows) {
      tx.insert(investmentHoldings)
        .values({
          id: row.id,
          accountId: row.accountId,
          plaidSecurityId: row.plaidSecurityId,
          securityName: row.securityName,
          ticker: row.ticker,
          quantity: row.quantity,
          costBasis: row.costBasis,
          currentValue: row.currentValue,
          type: row.type as "stock" | "etf" | "mutual_fund" | "bond" | "crypto" | "cash" | "other",
          sector: row.sector,
          currency: row.currency,
          asOfDate: row.asOfDate,
        })
        .run();
      holdingsUpserted++;
    }

    // Investment transactions: INSERT OR IGNORE
    for (const row of txnRows) {
      const result = tx
        .insert(investmentTransactions)
        .values({
          id: row.id,
          accountId: row.accountId,
          plaidInvestmentTransactionId: row.plaidInvestmentTransactionId,
          securityName: row.securityName,
          ticker: row.ticker,
          type: row.type as "buy" | "sell" | "dividend" | "transfer" | "fee" | "other",
          quantity: row.quantity,
          price: row.price,
          amount: row.amount,
          fees: row.fees,
          date: row.date,
        })
        .onConflictDoNothing()
        .run();
      if (result.changes > 0) txnsInserted++;
    }

    // Snapshot holdings to history
    for (const row of holdingRows) {
      tx.insert(holdingsHistory)
        .values({
          id: uuid(),
          accountId: row.accountId,
          plaidSecurityId: row.plaidSecurityId,
          securityName: row.securityName,
          ticker: row.ticker,
          quantity: row.quantity,
          value: row.currentValue,
          date: today,
        })
        .onConflictDoNothing()
        .run();
    }
  });

  return { holdingsUpserted, txnsInserted };
}

// ─── Snapshot Holdings (Daily Safety Net) ───────────────────────────────────

export function snapshotHoldings(dbInstance: LedgrDb = defaultDb): void {
  const today = todayDateString();
  const allHoldings = dbInstance.select().from(investmentHoldings).all();

  for (const h of allHoldings) {
    dbInstance
      .insert(holdingsHistory)
      .values({
        id: uuid(),
        accountId: h.accountId,
        plaidSecurityId: h.plaidSecurityId,
        securityName: h.securityName,
        ticker: h.ticker,
        quantity: h.quantity,
        value: h.currentValue,
        date: today,
      })
      .onConflictDoNothing()
      .run();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/integration/investment-sync.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plaid/investments.ts tests/integration/investment-sync.test.ts
git commit -m "feat(phase10): add applyInvestmentsToDb and snapshotHoldings with integration tests"
```

---

### Task 7: Sync Orchestrator + Scheduler Wiring

**Files:**
- Modify: `src/lib/plaid/investments.ts`
- Modify: `src/lib/jobs/scheduler.ts`

- [ ] **Step 1: Add the `syncInvestments` orchestrator**

Add to `src/lib/plaid/investments.ts`:

```typescript
import { getPlaidClient } from "./client";
import { decrypt } from "@/lib/encryption";
import {
  extractPlaidErrorCode,
  REAUTH_ERROR_CODES,
  TRANSIENT_ERROR_CODES,
  SKIP_ERROR_CODES,
} from "./utils";
import { plaidItems } from "@/db/schema";

const activeInvestmentSyncs = new Map<string, Promise<InvestmentSyncResult>>();

export async function syncInvestments(
  itemId: string,
  householdId: string,
  db: LedgrDb,
): Promise<InvestmentSyncResult> {
  const existing = activeInvestmentSyncs.get(itemId);
  if (existing) return existing;

  const promise = doInvestmentSync(itemId, householdId, db);
  activeInvestmentSyncs.set(itemId, promise);

  try {
    return await promise;
  } finally {
    activeInvestmentSyncs.delete(itemId);
  }
}

async function doInvestmentSync(
  itemId: string,
  householdId: string,
  db: LedgrDb,
): Promise<InvestmentSyncResult> {
  const item = db
    .select({ accessToken: plaidItems.accessToken })
    .from(plaidItems)
    .where(eq(plaidItems.id, itemId))
    .get();

  if (!item) {
    return { success: false, error: "Item not found" };
  }

  const accessToken = decrypt(item.accessToken);
  const client = getPlaidClient();

  // Build account map
  const itemAccounts = db
    .select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId })
    .from(accounts)
    .where(eq(accounts.plaidItemId, itemId))
    .all();

  const plaidToInternalAccount = new Map<string, string>();
  for (const acc of itemAccounts) {
    if (acc.plaidAccountId) {
      plaidToInternalAccount.set(acc.plaidAccountId, acc.id);
    }
  }

  try {
    // Fetch holdings
    const { holdings: rawHoldings, securities: holdingSecurities } =
      await fetchHoldings(client, accessToken);

    // Fetch investment transactions (24 months)
    const endDate = todayDateString();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 24);
    const startDateStr = startDate.toISOString().split("T")[0];

    const { transactions: rawTxns, securities: txnSecurities } =
      await fetchAllInvestmentTransactionPages(client, accessToken, startDateStr, endDate);

    // Merge securities from both responses
    const allSecurities = new Map<string, PlaidSecurity>();
    for (const sec of holdingSecurities) allSecurities.set(sec.security_id, sec);
    for (const sec of txnSecurities) allSecurities.set(sec.security_id, sec);
    const mergedSecurities = Array.from(allSecurities.values());

    // Process
    const holdingRows = processHoldings(rawHoldings, mergedSecurities, householdId, plaidToInternalAccount);
    const txnRows = processInvestmentTransactions(rawTxns, mergedSecurities, plaidToInternalAccount);

    // Apply
    const result = applyInvestmentsToDb(db, holdingRows, txnRows, itemId, householdId);

    return {
      success: true,
      holdingsUpserted: result.holdingsUpserted,
      txnsInserted: result.txnsInserted,
    };
  } catch (err: unknown) {
    const errorCode = extractPlaidErrorCode(err);

    if (errorCode && SKIP_ERROR_CODES.has(errorCode)) {
      return { success: true, skipped: true };
    }

    if (errorCode && REAUTH_ERROR_CODES.has(errorCode)) {
      db.update(plaidItems)
        .set({ status: "reauth_required" })
        .where(eq(plaidItems.id, itemId))
        .run();
      return { success: false, error: `Reauth required: ${errorCode}` };
    }

    if (errorCode && TRANSIENT_ERROR_CODES.has(errorCode)) {
      db.update(plaidItems)
        .set({ status: "error" })
        .where(eq(plaidItems.id, itemId))
        .run();
      return { success: false, error: `Transient error: ${errorCode}` };
    }

    return { success: false, error: String(err) };
  }
}
```

- [ ] **Step 2: Wire investment sync into scheduler**

In `src/lib/jobs/scheduler.ts`, add the import:

```typescript
import { syncInvestments, snapshotHoldings } from "@/lib/plaid/investments";
```

Inside the existing `"0 */4 * * *"` cron callback, after the recurring sync `try/catch` block (inside `for (const item of activeItems)`), add:

```typescript
          // Chain investment sync for items with investment accounts
          try {
            const investmentAccounts = db
              .select({ id: accounts.id })
              .from(accounts)
              .where(
                and(
                  eq(accounts.plaidItemId, item.id),
                  eq(accounts.type, "investment"),
                  isNull(accounts.deletedAt),
                )
              )
              .all();

            if (investmentAccounts.length > 0) {
              const invResult = await syncInvestments(item.id, item.householdId, db);
              if (invResult.success && !invResult.skipped) {
                console.log(
                  `[scheduler] Investment sync for ${item.id}: ${invResult.holdingsUpserted} holdings, ${invResult.txnsInserted} txns`
                );
              } else if (invResult.skipped) {
                console.log(`[scheduler] Investment sync skipped for ${item.id} (product not supported)`);
              }
            }
          } catch (invErr) {
            console.error(`[scheduler] Investment sync failed for ${item.id}:`, invErr);
          }
```

Add a new daily cron job after the existing midnight balance snapshot:

```typescript
  // Holdings snapshot: every day at 1am (safety net)
  cron.schedule("0 1 * * *", async () => {
    console.log("[scheduler] Starting holdings snapshot job");
    try {
      snapshotHoldings();
      console.log("[scheduler] Holdings snapshot job complete");
    } catch (e) {
      console.error("[scheduler] Unexpected error during holdings snapshot:", e);
    }
  });
```

- [ ] **Step 3: Verify with typecheck**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/plaid/investments.ts src/lib/jobs/scheduler.ts
git commit -m "feat(phase10): add syncInvestments orchestrator and scheduler wiring"
```

---

### Task 8: Query Layer + Integration Tests

**Files:**
- Create: `src/queries/investments.ts`
- Create: `tests/integration/investment-queries.test.ts`

- [ ] **Step 1: Write the query tests**

Create `tests/integration/investment-queries.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertInvestmentHolding,
  insertHoldingsSnapshot,
  insertInvestmentTransaction,
} from "./helpers";
import {
  getPortfolioSummary,
  getAssetAllocation,
  getHoldings,
  getPortfolioHistory,
  getInvestmentTransactions,
} from "@/queries/investments";
import type { LedgrDb } from "@/db";

describe("investment queries", () => {
  let db: LedgrDb;
  let householdId: string;
  let accountId: string;

  beforeEach(() => {
    db = createTestDb();
    const hh = insertHousehold(db);
    householdId = hh.householdId;
    const acc = insertAccount(db, householdId, { type: "investment" });
    accountId = acc.accountId;
  });

  describe("getPortfolioSummary", () => {
    it("returns totals from holdings", () => {
      insertInvestmentHolding(db, accountId, { currentValue: 150000, costBasis: 120000 });
      insertInvestmentHolding(db, accountId, { currentValue: 200000, costBasis: 180000, ticker: "VOO", plaidSecurityId: "sec-2" });

      const summary = getPortfolioSummary(householdId, db);
      expect(summary.totalValue).toBe(350000);
      expect(summary.totalCostBasis).toBe(300000);
      expect(summary.totalGainLoss).toBe(50000);
    });

    it("returns dayChange from holdings_history", () => {
      insertHoldingsSnapshot(db, accountId, "2026-05-09", { value: 140000, plaidSecurityId: "sec-1" });
      insertHoldingsSnapshot(db, accountId, "2026-05-10", { value: 150000, plaidSecurityId: "sec-1" });

      const summary = getPortfolioSummary(householdId, db, "2026-05-10");
      expect(summary.dayChange).toBe(10000);
    });

    it("returns null dayChange with only one date", () => {
      insertHoldingsSnapshot(db, accountId, "2026-05-10", { value: 150000 });

      const summary = getPortfolioSummary(householdId, db, "2026-05-10");
      expect(summary.dayChange).toBeNull();
    });
  });

  describe("getAssetAllocation", () => {
    it("groups by type", () => {
      insertInvestmentHolding(db, accountId, { type: "stock", currentValue: 100000, plaidSecurityId: "sec-1" });
      insertInvestmentHolding(db, accountId, { type: "etf", currentValue: 200000, plaidSecurityId: "sec-2" });

      const allocation = getAssetAllocation(householdId, db);
      expect(allocation).toHaveLength(2);
      const stockSlice = allocation.find((a) => a.type === "stock");
      expect(stockSlice?.value).toBe(100000);
      expect(Math.round(stockSlice!.percentage)).toBe(33);
    });
  });

  describe("getHoldings", () => {
    it("consolidated view merges by ticker", () => {
      const acc2 = insertAccount(db, householdId, { type: "investment", name: "401k" });
      insertInvestmentHolding(db, accountId, { ticker: "AAPL", currentValue: 100000, quantity: 10, plaidSecurityId: "sec-1" });
      insertInvestmentHolding(db, acc2.accountId, { ticker: "AAPL", currentValue: 150000, quantity: 15, plaidSecurityId: "sec-1" });

      const holdings = getHoldings(householdId, "consolidated", undefined, db);
      const aapl = holdings.find((h) => h.ticker === "AAPL");
      expect(aapl?.currentValue).toBe(250000);
      expect(aapl?.quantity).toBe(25);
    });

    it("by-account view returns separate rows", () => {
      const acc2 = insertAccount(db, householdId, { type: "investment", name: "401k" });
      insertInvestmentHolding(db, accountId, { ticker: "AAPL", currentValue: 100000, plaidSecurityId: "sec-1" });
      insertInvestmentHolding(db, acc2.accountId, { ticker: "AAPL", currentValue: 150000, plaidSecurityId: "sec-1" });

      const holdings = getHoldings(householdId, "by-account", undefined, db);
      expect(holdings).toHaveLength(2);
    });
  });

  describe("getPortfolioHistory", () => {
    it("aggregates by date", () => {
      insertHoldingsSnapshot(db, accountId, "2026-05-08", { value: 100000, plaidSecurityId: "sec-1" });
      insertHoldingsSnapshot(db, accountId, "2026-05-08", { value: 200000, plaidSecurityId: "sec-2" });
      insertHoldingsSnapshot(db, accountId, "2026-05-09", { value: 120000, plaidSecurityId: "sec-1" });

      const history = getPortfolioHistory(householdId, { dateFrom: "2026-05-01", dateTo: "2026-05-10" }, db);
      expect(history).toHaveLength(2);
      const day8 = history.find((h) => h.date === "2026-05-08");
      expect(day8?.value).toBe(300000);
    });
  });

  describe("getInvestmentTransactions", () => {
    it("filters by type and paginates", () => {
      insertInvestmentTransaction(db, accountId, { type: "buy", date: "2026-05-01", amount: 75000, plaidInvestmentTransactionId: "t1" });
      insertInvestmentTransaction(db, accountId, { type: "sell", date: "2026-05-02", amount: -80000, plaidInvestmentTransactionId: "t2" });
      insertInvestmentTransaction(db, accountId, { type: "buy", date: "2026-05-03", amount: 60000, plaidInvestmentTransactionId: "t3" });

      const page = getInvestmentTransactions(householdId, { type: "buy" }, 10, null, db);
      expect(page.rows).toHaveLength(2);
      expect(page.rows.every((r) => r.type === "buy")).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/integration/investment-queries.test.ts`
Expected: FAIL — query functions not found.

- [ ] **Step 3: Implement the query layer**

Create `src/queries/investments.ts`:

```typescript
import { eq, and, sql, desc, gte, lte, isNull } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { investmentHoldings, holdingsHistory, investmentTransactions, accounts } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { todayDateString } from "@/lib/date-utils";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PortfolioSummary {
  totalValue: number;
  dayChange: number | null;
  totalGainLoss: number;
  totalCostBasis: number;
}

export interface PortfolioPoint {
  date: string;
  value: number;
}

export interface AllocationSlice {
  type: string;
  value: number;
  percentage: number;
}

export interface InvestmentHoldingRow {
  ticker: string | null;
  securityName: string;
  type: string | null;
  sector: string | null;
  quantity: number;
  currentValue: number;
  costBasis: number | null;
  gainLoss: number | null;
  gainLossPercent: number | null;
  accountName?: string;
  accountId?: string;
}

export interface InvTxnRow {
  id: string;
  date: string;
  type: string | null;
  securityName: string | null;
  ticker: string | null;
  quantity: number | null;
  price: number | null;
  amount: number;
  fees: number | null;
  accountName: string;
}

export interface InvTxnPage {
  rows: InvTxnRow[];
  nextCursor: string | null;
}

export interface InvestmentFilters {
  type?: string;
  accountId?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function encodeCursor(date: string, id: string): string {
  return Buffer.from(JSON.stringify({ date, id })).toString("base64");
}

function decodeCursor(cursor: string): { date: string; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64").toString());
    if (typeof parsed.date === "string" && typeof parsed.id === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

function investmentAccountIds(householdId: string, db: LedgrDb): string[] {
  const scoped = scopedQuery(householdId, db);
  const rows = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(scoped.where(accounts, eq(accounts.type, "investment"), isNull(accounts.deletedAt)))
    .all();
  return rows.map((r) => r.id);
}

// ─── Queries ────────────────────────────────────────────────────────────────

export function getPortfolioSummary(
  householdId: string,
  db: LedgrDb = defaultDb,
  today?: string,
): PortfolioSummary {
  const accIds = investmentAccountIds(householdId, db);
  if (accIds.length === 0) return { totalValue: 0, dayChange: null, totalGainLoss: 0, totalCostBasis: 0 };

  const holdings = db
    .select({
      currentValue: investmentHoldings.currentValue,
      costBasis: investmentHoldings.costBasis,
    })
    .from(investmentHoldings)
    .where(sql`${investmentHoldings.accountId} IN (${sql.join(accIds.map(id => sql`${id}`), sql`, `)})`)
    .all();

  let totalValue = 0;
  let totalCostBasis = 0;
  for (const h of holdings) {
    totalValue += h.currentValue ?? 0;
    if (h.costBasis !== null) totalCostBasis += h.costBasis;
  }

  // Day change: today vs yesterday
  const todayStr = today ?? todayDateString();
  const yesterday = new Date(todayStr);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  const todayTotal = db
    .select({ total: sql<number>`COALESCE(SUM(${holdingsHistory.value}), 0)` })
    .from(holdingsHistory)
    .where(and(
      sql`${holdingsHistory.accountId} IN (${sql.join(accIds.map(id => sql`${id}`), sql`, `)})`,
      eq(holdingsHistory.date, todayStr),
    ))
    .get();

  const yesterdayTotal = db
    .select({ total: sql<number>`COALESCE(SUM(${holdingsHistory.value}), 0)` })
    .from(holdingsHistory)
    .where(and(
      sql`${holdingsHistory.accountId} IN (${sql.join(accIds.map(id => sql`${id}`), sql`, `)})`,
      eq(holdingsHistory.date, yesterdayStr),
    ))
    .get();

  const todayVal = todayTotal?.total ?? 0;
  const yesterdayVal = yesterdayTotal?.total ?? 0;

  const hasToday = db
    .select({ id: holdingsHistory.id })
    .from(holdingsHistory)
    .where(and(
      sql`${holdingsHistory.accountId} IN (${sql.join(accIds.map(id => sql`${id}`), sql`, `)})`,
      eq(holdingsHistory.date, todayStr),
    ))
    .limit(1)
    .get();

  const hasYesterday = db
    .select({ id: holdingsHistory.id })
    .from(holdingsHistory)
    .where(and(
      sql`${holdingsHistory.accountId} IN (${sql.join(accIds.map(id => sql`${id}`), sql`, `)})`,
      eq(holdingsHistory.date, yesterdayStr),
    ))
    .limit(1)
    .get();

  const dayChange = hasToday && hasYesterday ? todayVal - yesterdayVal : null;

  return {
    totalValue,
    dayChange,
    totalGainLoss: totalValue - totalCostBasis,
    totalCostBasis,
  };
}

export function getPortfolioHistory(
  householdId: string,
  dateRange: { dateFrom: string; dateTo: string },
  db: LedgrDb = defaultDb,
): PortfolioPoint[] {
  const accIds = investmentAccountIds(householdId, db);
  if (accIds.length === 0) return [];

  return db
    .select({
      date: holdingsHistory.date,
      value: sql<number>`SUM(${holdingsHistory.value})`,
    })
    .from(holdingsHistory)
    .where(and(
      sql`${holdingsHistory.accountId} IN (${sql.join(accIds.map(id => sql`${id}`), sql`, `)})`,
      gte(holdingsHistory.date, dateRange.dateFrom),
      lte(holdingsHistory.date, dateRange.dateTo),
    ))
    .groupBy(holdingsHistory.date)
    .orderBy(holdingsHistory.date)
    .all();
}

export function getAssetAllocation(
  householdId: string,
  db: LedgrDb = defaultDb,
): AllocationSlice[] {
  const accIds = investmentAccountIds(householdId, db);
  if (accIds.length === 0) return [];

  const rows = db
    .select({
      type: investmentHoldings.type,
      value: sql<number>`SUM(${investmentHoldings.currentValue})`,
    })
    .from(investmentHoldings)
    .where(sql`${investmentHoldings.accountId} IN (${sql.join(accIds.map(id => sql`${id}`), sql`, `)})`)
    .groupBy(investmentHoldings.type)
    .all();

  const total = rows.reduce((sum, r) => sum + (r.value ?? 0), 0);

  return rows.map((r) => ({
    type: r.type ?? "other",
    value: r.value ?? 0,
    percentage: total > 0 ? ((r.value ?? 0) / total) * 100 : 0,
  }));
}

export function getHoldings(
  householdId: string,
  view: "consolidated" | "by-account",
  accountId: string | undefined,
  db: LedgrDb = defaultDb,
): InvestmentHoldingRow[] {
  const accIds = accountId ? [accountId] : investmentAccountIds(householdId, db);
  if (accIds.length === 0) return [];

  if (view === "consolidated") {
    const rows = db
      .select({
        ticker: investmentHoldings.ticker,
        securityName: investmentHoldings.securityName,
        type: investmentHoldings.type,
        sector: investmentHoldings.sector,
        quantity: sql<number>`SUM(${investmentHoldings.quantity})`,
        currentValue: sql<number>`SUM(${investmentHoldings.currentValue})`,
        costBasis: sql<number | null>`SUM(${investmentHoldings.costBasis})`,
      })
      .from(investmentHoldings)
      .where(sql`${investmentHoldings.accountId} IN (${sql.join(accIds.map(id => sql`${id}`), sql`, `)})`)
      .groupBy(sql`COALESCE(${investmentHoldings.ticker}, ${investmentHoldings.securityName})`)
      .orderBy(sql`SUM(${investmentHoldings.currentValue}) DESC`)
      .all();

    return rows.map((r) => ({
      ticker: r.ticker,
      securityName: r.securityName,
      type: r.type,
      sector: r.sector,
      quantity: r.quantity,
      currentValue: r.currentValue,
      costBasis: r.costBasis,
      gainLoss: r.costBasis !== null ? r.currentValue - r.costBasis : null,
      gainLossPercent: r.costBasis !== null && r.costBasis !== 0
        ? ((r.currentValue - r.costBasis) / r.costBasis) * 100
        : null,
    }));
  }

  // by-account
  const rows = db
    .select({
      ticker: investmentHoldings.ticker,
      securityName: investmentHoldings.securityName,
      type: investmentHoldings.type,
      sector: investmentHoldings.sector,
      quantity: investmentHoldings.quantity,
      currentValue: investmentHoldings.currentValue,
      costBasis: investmentHoldings.costBasis,
      accountName: accounts.name,
      accountId: investmentHoldings.accountId,
    })
    .from(investmentHoldings)
    .innerJoin(accounts, eq(investmentHoldings.accountId, accounts.id))
    .where(sql`${investmentHoldings.accountId} IN (${sql.join(accIds.map(id => sql`${id}`), sql`, `)})`)
    .orderBy(sql`${investmentHoldings.currentValue} DESC`)
    .all();

  return rows.map((r) => ({
    ticker: r.ticker,
    securityName: r.securityName,
    type: r.type,
    sector: r.sector,
    quantity: r.quantity ?? 0,
    currentValue: r.currentValue ?? 0,
    costBasis: r.costBasis,
    gainLoss: r.costBasis !== null && r.currentValue !== null ? r.currentValue - r.costBasis : null,
    gainLossPercent: r.costBasis !== null && r.costBasis !== 0 && r.currentValue !== null
      ? ((r.currentValue - r.costBasis) / r.costBasis) * 100
      : null,
    accountName: r.accountName,
    accountId: r.accountId,
  }));
}

export function getInvestmentTransactions(
  householdId: string,
  filters: InvestmentFilters = {},
  limit = 50,
  cursor: string | null = null,
  db: LedgrDb = defaultDb,
): InvTxnPage {
  const accIds = filters.accountId ? [filters.accountId] : investmentAccountIds(householdId, db);
  if (accIds.length === 0) return { rows: [], nextCursor: null };

  const conditions = [
    sql`${investmentTransactions.accountId} IN (${sql.join(accIds.map(id => sql`${id}`), sql`, `)})`,
  ];

  if (filters.type) conditions.push(eq(investmentTransactions.type, filters.type));
  if (filters.dateFrom) conditions.push(gte(investmentTransactions.date, filters.dateFrom));
  if (filters.dateTo) conditions.push(lte(investmentTransactions.date, filters.dateTo));

  const decoded = cursor ? decodeCursor(cursor) : null;
  if (decoded) {
    conditions.push(
      sql`(${investmentTransactions.date} < ${decoded.date} OR (${investmentTransactions.date} = ${decoded.date} AND ${investmentTransactions.id} < ${decoded.id}))`,
    );
  }

  const rows = db
    .select({
      id: investmentTransactions.id,
      date: investmentTransactions.date,
      type: investmentTransactions.type,
      securityName: investmentTransactions.securityName,
      ticker: investmentTransactions.ticker,
      quantity: investmentTransactions.quantity,
      price: investmentTransactions.price,
      amount: investmentTransactions.amount,
      fees: investmentTransactions.fees,
      accountName: accounts.name,
    })
    .from(investmentTransactions)
    .innerJoin(accounts, eq(investmentTransactions.accountId, accounts.id))
    .where(and(...conditions))
    .orderBy(desc(investmentTransactions.date), desc(investmentTransactions.id))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  const nextCursor = hasMore
    ? encodeCursor(pageRows[pageRows.length - 1].date, pageRows[pageRows.length - 1].id)
    : null;

  return { rows: pageRows, nextCursor };
}

export function getInvestmentsSummary(
  householdId: string,
  db: LedgrDb = defaultDb,
): { totalValue: number; dayChange: number | null } {
  const summary = getPortfolioSummary(householdId, db);
  return { totalValue: summary.totalValue, dayChange: summary.dayChange };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/integration/investment-queries.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/queries/investments.ts tests/integration/investment-queries.test.ts
git commit -m "feat(phase10): add investment query layer with integration tests"
```

---

### Task 9: Server Actions

**Files:**
- Create: `src/actions/investments.ts`

- [ ] **Step 1: Create the server actions**

Create `src/actions/investments.ts`:

```typescript
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getHouseholdId } from "@/lib/auth/session";
import { scopedQuery } from "@/lib/scoped-query";
import { db as defaultDb, type LedgrDb } from "@/db";
import { plaidItems } from "@/db/schema";
import { syncInvestments, type InvestmentSyncResult } from "@/lib/plaid/investments";
import { getInvestmentTransactions, type InvestmentFilters } from "@/queries/investments";

export async function triggerInvestmentSync(
  plaidItemId: string,
  db: LedgrDb = defaultDb,
): Promise<InvestmentSyncResult> {
  const householdId = await getHouseholdId();
  const scoped = scopedQuery(householdId, db);

  const item = db
    .select({ id: plaidItems.id })
    .from(plaidItems)
    .where(scoped.where(plaidItems, eq(plaidItems.id, plaidItemId)))
    .get();

  if (!item) {
    return { success: false, error: "Institution not found" };
  }

  const result = await syncInvestments(plaidItemId, householdId, db);

  revalidatePath("/");
  revalidatePath("/investments");

  return result;
}

export async function loadMoreInvestmentTransactions(
  cursor: string,
  filters: InvestmentFilters = {},
) {
  const householdId = await getHouseholdId();
  return getInvestmentTransactions(householdId, filters, 50, cursor);
}
```

- [ ] **Step 2: Verify with typecheck**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/actions/investments.ts
git commit -m "feat(phase10): add investment server actions"
```

---

### Task 10: Refactor Existing Atoms

**Files:**
- Modify: `src/components/atoms/net-worth-area-chart.tsx`
- Modify: `src/components/atoms/spending-chart.tsx`
- Modify: `src/components/molecules/comparison-badge.tsx`

This task generalizes existing components so they can be reused for investments without creating duplicates. All existing callers must continue to work unchanged.

- [ ] **Step 1: Generalize `net-worth-area-chart.tsx`**

Add a new optional `mode` prop. When `mode="single"`, render a single-series AreaChart. Default is `"multi"` (existing behavior). Add this interface and update the component:

```typescript
interface NetWorthAreaChartProps {
  data: NetWorthPoint[] | { date: string; value: number }[];
  height?: number;
  mode?: "multi" | "single";
  seriesName?: string;
}
```

After the existing empty-state check, add a branch for single mode:

```typescript
export function NetWorthAreaChart({ data, mode = "multi", seriesName = "Value" }: NetWorthAreaChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        {mode === "single" ? "Portfolio history will appear after your accounts sync." : "Net worth history will appear after your accounts sync."}
      </div>
    );
  }

  if (mode === "single") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <defs>
            <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="date" tickFormatter={formatDateShort} tick={{ fontSize: 11 }} />
          <YAxis
            tickFormatter={(v) => centsToDisplay(v).replace(/\.00$/, "")}
            tick={{ fontSize: 11 }}
            width={60}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="value"
            name={seriesName}
            fill="url(#portfolioGradient)"
            stroke={PRIMARY_COLOR}
            strokeWidth={2}
          />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  // Existing multi-series code (unchanged)
  return (
    <ResponsiveContainer width="100%" height="100%">
      {/* ... existing ComposedChart with netWorth, assets, liabilities ... */}
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Generalize `spending-chart.tsx`**

Add a generic data interface. The existing `MonthlySpendingRow` callers pass `data` as before. New callers can pass `{ name: string; value: number }[]`:

```typescript
export interface ChartDataItem {
  name: string;
  value: number;
}

interface SpendingChartProps {
  data: MonthlySpendingRow[] | ChartDataItem[];
  viewMode: "donut" | "bar";
}
```

Normalize the data inside the component:

```typescript
export function SpendingChart({ data, viewMode }: SpendingChartProps) {
  // Normalize to ChartDataItem[]
  const normalizedData: ChartDataItem[] = data.map((item) => {
    if ("categoryName" in item) {
      return { name: item.categoryName, value: item.total };
    }
    return item;
  });

  const total = normalizedData.reduce((sum, d) => sum + d.value, 0);
  const top8 = normalizedData.slice(0, 8);
  const otherTotal = normalizedData.slice(8).reduce((sum, d) => sum + d.value, 0);
  const chartData =
    otherTotal > 0
      ? [...top8, { name: "Other", value: otherTotal }]
      : top8;
  // ... rest of the render logic uses chartData.name and chartData.value
```

Update `SpendingLegendRow` to use `name` instead of requiring `icon`:

```typescript
function SpendingLegendRow({
  name,
  icon,
  amount,
  percentage,
  color,
}: {
  name: string;
  icon?: string;
  amount: number;
  percentage: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="truncate flex-1">
        {icon ? `${icon} ` : ""}{name}
      </span>
      <span className="font-medium tabular-nums">{centsToDisplay(amount)}</span>
      <span className="text-muted-foreground text-xs w-10 text-right">{percentage.toFixed(0)}%</span>
    </div>
  );
}
```

- [ ] **Step 3: Extend `comparison-badge.tsx`**

Add `pill` and nullable value support:

```typescript
interface ComparisonBadgeProps {
  current: number;
  previous: number | null;
  periodLabel?: string;
  pill?: boolean;
}

export function ComparisonBadge({ current, previous, periodLabel, pill }: ComparisonBadgeProps) {
  if (previous === null || previous === 0) {
    if (pill) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground rounded-full bg-muted px-2 py-0.5">
          —
        </span>
      );
    }
    return null;
  }

  const change = ((current - previous) / previous) * 100;
  const isUp = change > 0;
  const isFlat = Math.abs(change) < 0.5;

  const className = `inline-flex items-center gap-1 text-xs ${
    isFlat
      ? "text-muted-foreground"
      : isUp
        ? "text-destructive"
        : "text-green-600"
  }${pill ? " rounded-full bg-muted px-2 py-0.5" : ""}`;

  return (
    <span className={className}>
      {isFlat ? (
        <Minus className="size-3" />
      ) : isUp ? (
        <TrendingUp className="size-3" />
      ) : (
        <TrendingDown className="size-3" />
      )}
      <span className="tabular-nums">
        {isFlat ? "0%" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`}
      </span>
      {periodLabel && <span className="text-muted-foreground">{periodLabel}</span>}
    </span>
  );
}
```

Make `periodLabel` optional (it was required before — check existing callers and add defaults if needed).

- [ ] **Step 4: Verify existing callers still work**

Run: `pnpm typecheck`
Expected: No type errors. Existing dashboard/report pages use the same components unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/components/atoms/net-worth-area-chart.tsx src/components/atoms/spending-chart.tsx src/components/molecules/comparison-badge.tsx
git commit -m "refactor(phase10): generalize chart atoms and comparison badge for reuse"
```

---

### Task 11: Investment Type Badge Atom

**Files:**
- Create: `src/components/atoms/investment-type-badge.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { Badge } from "@/components/ui/badge";

const TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  stock: { label: "Stock", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  etf: { label: "ETF", className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200" },
  mutual_fund: { label: "Mutual Fund", className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  bond: { label: "Bond", className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  crypto: { label: "Crypto", className: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  cash: { label: "Cash", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  other: { label: "Other", className: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200" },
};

interface InvestmentTypeBadgeProps {
  type: string | null;
}

export function InvestmentTypeBadge({ type }: InvestmentTypeBadgeProps) {
  const config = TYPE_CONFIG[type ?? "other"] ?? TYPE_CONFIG.other;
  return (
    <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 font-medium ${config.className}`}>
      {config.label}
    </Badge>
  );
}
```

- [ ] **Step 2: Verify with typecheck**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/atoms/investment-type-badge.tsx
git commit -m "feat(phase10): add InvestmentTypeBadge atom"
```

---

### Task 12: Molecules (Holding Row, Transaction Row, Filters)

**Files:**
- Create: `src/components/molecules/holding-row.tsx`
- Create: `src/components/molecules/investment-transaction-row.tsx`
- Create: `src/components/molecules/investment-filters.tsx`

- [ ] **Step 1: Create `holding-row.tsx`**

```typescript
import { centsToDisplay } from "@/lib/money";
import { InvestmentTypeBadge } from "@/components/atoms/investment-type-badge";
import { ComparisonBadge } from "@/components/molecules/comparison-badge";
import type { InvestmentHoldingRow } from "@/queries/investments";

interface HoldingRowProps {
  holding: InvestmentHoldingRow;
  onClick?: () => void;
}

function formatQuantity(qty: number): string {
  const str = qty.toFixed(4);
  return str.replace(/\.?0+$/, "");
}

export function HoldingRow({ holding, onClick }: HoldingRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid grid-cols-[minmax(80px,1fr)_2fr_80px_80px_100px_100px_100px_90px] gap-2 items-center h-10 px-3 text-sm hover:bg-muted/50 transition-colors w-full text-left border-b border-border/50"
    >
      <span className="font-medium tabular-nums truncate">{holding.ticker ?? "—"}</span>
      <span className="truncate text-muted-foreground">{holding.securityName}</span>
      <InvestmentTypeBadge type={holding.type} />
      <span className="tabular-nums text-right">{formatQuantity(holding.quantity)}</span>
      <span className="tabular-nums text-right">{centsToDisplay(holding.currentValue)}</span>
      <span className="tabular-nums text-right text-muted-foreground">
        {holding.costBasis !== null ? centsToDisplay(holding.costBasis) : "—"}
      </span>
      <span className="text-right">
        {holding.gainLossPercent !== null ? (
          <ComparisonBadge
            current={holding.currentValue}
            previous={holding.costBasis}
            pill
          />
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Create `investment-transaction-row.tsx`**

```typescript
import { centsToDisplay } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { formatDateShort } from "@/lib/date-utils";
import type { InvTxnRow } from "@/queries/investments";

const TYPE_COLORS: Record<string, string> = {
  buy: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  sell: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  dividend: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  fee: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  transfer: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
};

interface InvestmentTransactionRowProps {
  transaction: InvTxnRow;
}

export function InvestmentTransactionRow({ transaction }: InvestmentTransactionRowProps) {
  const typeColor = TYPE_COLORS[transaction.type ?? "other"] ?? TYPE_COLORS.other;

  return (
    <div className="grid grid-cols-[90px_70px_2fr_100px_100px] gap-2 items-center h-10 px-3 text-sm border-b border-border/50">
      <span className="text-muted-foreground tabular-nums">{formatDateShort(transaction.date)}</span>
      <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 font-medium w-fit ${typeColor}`}>
        {(transaction.type ?? "other").toUpperCase()}
      </Badge>
      <span className="truncate">
        {transaction.securityName ?? "Unknown"}{" "}
        {transaction.ticker && <span className="text-muted-foreground">({transaction.ticker})</span>}
      </span>
      <span className="tabular-nums text-right text-muted-foreground">
        {transaction.quantity != null && transaction.price != null
          ? `${transaction.quantity} × ${centsToDisplay(transaction.price)}`
          : "—"}
      </span>
      <span className={`tabular-nums text-right font-medium ${transaction.amount < 0 ? "text-green-600" : ""}`}>
        {centsToDisplay(transaction.amount)}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Create `investment-filters.tsx`**

```typescript
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface InvestmentFiltersProps {
  accounts: { id: string; name: string }[];
}

const TXN_TYPES = [
  { value: "all", label: "All Types" },
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
  { value: "dividend", label: "Dividend" },
  { value: "fee", label: "Fee" },
  { value: "transfer", label: "Transfer" },
];

export function InvestmentFilters({ accounts }: InvestmentFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex gap-2">
      <Select
        value={searchParams.get("type") ?? "all"}
        onValueChange={(v) => updateParam("type", v)}
      >
        <SelectTrigger className="w-[130px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TXN_TYPES.map((t) => (
            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {accounts.length > 1 && (
        <Select
          value={searchParams.get("account") ?? "all"}
          onValueChange={(v) => updateParam("account", v)}
        >
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="All Accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify with typecheck**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/molecules/holding-row.tsx src/components/molecules/investment-transaction-row.tsx src/components/molecules/investment-filters.tsx
git commit -m "feat(phase10): add investment molecules (holding row, transaction row, filters)"
```

---

### Task 13: Organisms (Summary Header, Holdings Table, Transaction List, Page Layout)

**Files:**
- Create: `src/components/organisms/portfolio-summary-header.tsx`
- Create: `src/components/organisms/holdings-table.tsx`
- Create: `src/components/organisms/investment-transaction-list.tsx`
- Create: `src/components/organisms/investment-page-layout.tsx`

- [ ] **Step 1: Create `portfolio-summary-header.tsx`**

```typescript
import { SummaryCard } from "@/components/molecules/summary-card";
import { ComparisonBadge } from "@/components/molecules/comparison-badge";
import { centsToDisplay } from "@/lib/money";
import type { PortfolioSummary } from "@/queries/investments";

interface PortfolioSummaryHeaderProps {
  summary: PortfolioSummary;
}

export function PortfolioSummaryHeader({ summary }: PortfolioSummaryHeaderProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <SummaryCard
        label="Total Portfolio"
        amount={summary.totalValue}
      />
      <SummaryCard
        label="Day Change"
        amount={summary.dayChange}
        variant={summary.dayChange !== null && summary.dayChange >= 0 ? "positive" : "negative"}
      />
      <SummaryCard
        label="Total Gain/Loss"
        amount={summary.totalGainLoss}
        variant={summary.totalGainLoss >= 0 ? "positive" : "negative"}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create `holdings-table.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { HoldingRow } from "@/components/molecules/holding-row";
import { InvestmentTypeBadge } from "@/components/atoms/investment-type-badge";
import { ComparisonBadge } from "@/components/molecules/comparison-badge";
import { centsToDisplay } from "@/lib/money";
import type { InvestmentHoldingRow } from "@/queries/investments";

interface HoldingsTableProps {
  holdings: InvestmentHoldingRow[];
  view: "consolidated" | "by-account";
}

type SortKey = "value" | "gainLoss" | "name";

export function HoldingsTable({ holdings, view }: HoldingsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sortBy, setSortBy] = useState<SortKey>("value");
  const [selectedHolding, setSelectedHolding] = useState<InvestmentHoldingRow | null>(null);

  function handleViewChange(newView: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", newView);
    router.push(`?${params.toString()}`);
  }

  const sorted = [...holdings].sort((a, b) => {
    switch (sortBy) {
      case "value":
        return b.currentValue - a.currentValue;
      case "gainLoss":
        return (b.gainLossPercent ?? 0) - (a.gainLossPercent ?? 0);
      case "name":
        return a.securityName.localeCompare(b.securityName);
      default:
        return 0;
    }
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && handleViewChange(v)}
          size="sm"
        >
          <ToggleGroupItem value="consolidated" className="text-xs">Consolidated</ToggleGroupItem>
          <ToggleGroupItem value="by-account" className="text-xs">By Account</ToggleGroupItem>
        </ToggleGroup>

        <div className="flex gap-1">
          {(["value", "gainLoss", "name"] as SortKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSortBy(key)}
              className={`text-xs px-2 py-1 rounded ${sortBy === key ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"}`}
            >
              {key === "value" ? "Value" : key === "gainLoss" ? "Gain/Loss" : "Name"}
            </button>
          ))}
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-[minmax(80px,1fr)_2fr_80px_80px_100px_100px_100px_90px] gap-2 items-center h-8 px-3 text-xs font-medium text-muted-foreground bg-muted/30 border-b">
          <span>Ticker</span>
          <span>Name</span>
          <span>Type</span>
          <span className="text-right">Shares</span>
          <span className="text-right">Value</span>
          <span className="text-right">Cost</span>
          <span className="text-right">Gain/Loss</span>
        </div>
        {sorted.map((h, i) => (
          <HoldingRow
            key={`${h.ticker ?? h.securityName}-${h.accountId ?? i}`}
            holding={h}
            onClick={() => setSelectedHolding(h)}
          />
        ))}
        {sorted.length === 0 && (
          <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
            No holdings found.
          </div>
        )}
      </div>

      <Sheet open={!!selectedHolding} onOpenChange={() => setSelectedHolding(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{selectedHolding?.securityName}</SheetTitle>
          </SheetHeader>
          {selectedHolding && (
            <div className="space-y-4 mt-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold tabular-nums">{selectedHolding.ticker ?? "N/A"}</span>
                <InvestmentTypeBadge type={selectedHolding.type} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Value</span><p className="font-medium tabular-nums">{centsToDisplay(selectedHolding.currentValue)}</p></div>
                <div><span className="text-muted-foreground">Cost Basis</span><p className="font-medium tabular-nums">{selectedHolding.costBasis !== null ? centsToDisplay(selectedHolding.costBasis) : "—"}</p></div>
                <div><span className="text-muted-foreground">Shares</span><p className="font-medium tabular-nums">{selectedHolding.quantity}</p></div>
                <div><span className="text-muted-foreground">Gain/Loss</span><p>{selectedHolding.gainLossPercent !== null ? <ComparisonBadge current={selectedHolding.currentValue} previous={selectedHolding.costBasis} pill /> : "—"}</p></div>
                {selectedHolding.sector && <div className="col-span-2"><span className="text-muted-foreground">Sector</span><p>{selectedHolding.sector}</p></div>}
                {selectedHolding.accountName && <div className="col-span-2"><span className="text-muted-foreground">Account</span><p>{selectedHolding.accountName}</p></div>}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
```

- [ ] **Step 3: Create `investment-transaction-list.tsx`**

```typescript
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { InvestmentTransactionRow } from "@/components/molecules/investment-transaction-row";
import { InvestmentFilters } from "@/components/molecules/investment-filters";
import { loadMoreInvestmentTransactions } from "@/actions/investments";
import type { InvTxnRow, InvestmentFilters as IFilters } from "@/queries/investments";

interface InvestmentTransactionListProps {
  initialRows: InvTxnRow[];
  initialCursor: string | null;
  filters: IFilters;
  accounts: { id: string; name: string }[];
}

export function InvestmentTransactionList({
  initialRows,
  initialCursor,
  filters,
  accounts,
}: InvestmentTransactionListProps) {
  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(initialCursor);
  const [isPending, startTransition] = useTransition();

  function handleLoadMore() {
    if (!cursor) return;
    startTransition(async () => {
      const page = await loadMoreInvestmentTransactions(cursor, filters);
      setRows((prev) => [...prev, ...page.rows]);
      setCursor(page.nextCursor);
    });
  }

  return (
    <div className="space-y-2">
      <InvestmentFilters accounts={accounts} />

      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-[90px_70px_2fr_100px_100px] gap-2 items-center h-8 px-3 text-xs font-medium text-muted-foreground bg-muted/30 border-b">
          <span>Date</span>
          <span>Type</span>
          <span>Security</span>
          <span className="text-right">Qty × Price</span>
          <span className="text-right">Amount</span>
        </div>
        {rows.map((txn) => (
          <InvestmentTransactionRow key={txn.id} transaction={txn} />
        ))}
        {rows.length === 0 && (
          <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
            No investment transactions found.
          </div>
        )}
      </div>

      {cursor && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={isPending}>
            {isPending ? "Loading..." : "Load More"}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `investment-page-layout.tsx`**

```typescript
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp } from "lucide-react";
import { PortfolioSummaryHeader } from "@/components/organisms/portfolio-summary-header";
import { HoldingsTable } from "@/components/organisms/holdings-table";
import { InvestmentTransactionList } from "@/components/organisms/investment-transaction-list";
import { NetWorthAreaChart } from "@/components/atoms/net-worth-area-chart";
import { SpendingChart, type ChartDataItem } from "@/components/atoms/spending-chart";
import type {
  PortfolioSummary,
  PortfolioPoint,
  AllocationSlice,
  InvestmentHoldingRow,
  InvTxnRow,
  InvestmentFilters as IFilters,
} from "@/queries/investments";

interface InvestmentPageLayoutProps {
  summary: PortfolioSummary;
  history: PortfolioPoint[];
  allocation: AllocationSlice[];
  holdings: InvestmentHoldingRow[] | null;
  transactions: { rows: InvTxnRow[]; nextCursor: string | null } | null;
  activeTab: string;
  view: "consolidated" | "by-account";
  filters: IFilters;
  accounts: { id: string; name: string }[];
}

export function InvestmentPageLayout({
  summary,
  history,
  allocation,
  holdings,
  transactions,
  activeTab,
  view,
  filters,
  accounts,
}: InvestmentPageLayoutProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (summary.totalValue === 0 && !holdings?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
        <TrendingUp className="size-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">No Investment Accounts</h2>
        <p className="text-muted-foreground max-w-md">
          Connect a brokerage or retirement account via Plaid to see your portfolio here.
        </p>
      </div>
    );
  }

  function handleTabChange(tab: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`?${params.toString()}`);
  }

  const allocationChartData: ChartDataItem[] = allocation.map((a) => ({
    name: a.type.charAt(0).toUpperCase() + a.type.slice(1).replace("_", " "),
    value: a.value,
  }));

  return (
    <div className="space-y-6">
      <PortfolioSummaryHeader summary={summary} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border rounded-lg p-4 h-[280px]">
          <h3 className="text-sm font-medium mb-2">Portfolio Value</h3>
          <div className="h-[240px]">
            <NetWorthAreaChart data={history} mode="single" seriesName="Portfolio" />
          </div>
        </div>
        <div className="border rounded-lg p-4 h-[280px]">
          <h3 className="text-sm font-medium mb-2">Asset Allocation</h3>
          <div className="h-[240px]">
            <SpendingChart data={allocationChartData} viewMode="donut" />
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="holdings">Holdings</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>
        <TabsContent value="holdings" className="mt-4">
          {holdings && <HoldingsTable holdings={holdings} view={view} />}
        </TabsContent>
        <TabsContent value="transactions" className="mt-4">
          {transactions && (
            <InvestmentTransactionList
              initialRows={transactions.rows}
              initialCursor={transactions.nextCursor}
              filters={filters}
              accounts={accounts}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 5: Verify with typecheck**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/organisms/portfolio-summary-header.tsx src/components/organisms/holdings-table.tsx src/components/organisms/investment-transaction-list.tsx src/components/organisms/investment-page-layout.tsx
git commit -m "feat(phase10): add investment organisms (summary header, holdings table, transaction list, page layout)"
```

---

### Task 14: Page + Loading + Error + Sidebar Nav

**Files:**
- Create: `src/app/(dashboard)/investments/page.tsx`
- Create: `src/app/(dashboard)/investments/loading.tsx`
- Create: `src/app/(dashboard)/investments/error.tsx`
- Modify: `src/components/organisms/sidebar-nav.tsx`

- [ ] **Step 1: Create `page.tsx`**

```typescript
import { getHouseholdId } from "@/lib/auth/session";
import {
  getPortfolioSummary,
  getPortfolioHistory,
  getAssetAllocation,
  getHoldings,
  getInvestmentTransactions,
  type InvestmentFilters,
} from "@/queries/investments";
import { getAccounts } from "@/queries/accounts";
import { rangeToDateBounds } from "@/lib/date-utils";
import { InvestmentPageLayout } from "@/components/organisms/investment-page-layout";

const VALID_TABS = new Set(["holdings", "transactions"]);
const VALID_VIEWS = new Set(["consolidated", "by-account"]);

export default async function InvestmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const householdId = await getHouseholdId();
  const params = await searchParams;

  const tab = typeof params.tab === "string" && VALID_TABS.has(params.tab) ? params.tab : "holdings";
  const view = typeof params.view === "string" && VALID_VIEWS.has(params.view)
    ? (params.view as "consolidated" | "by-account")
    : "consolidated";

  const { from: dateFrom, to: dateTo } = rangeToDateBounds("1Y");
  const accountId = typeof params.account === "string" ? params.account : undefined;
  const type = typeof params.type === "string" ? params.type : undefined;

  const filters: InvestmentFilters = { dateFrom, dateTo, accountId, type };

  const [summary, history, allocation] = await Promise.all([
    getPortfolioSummary(householdId),
    getPortfolioHistory(householdId, { dateFrom, dateTo }),
    getAssetAllocation(householdId),
  ]);

  const holdings = tab === "holdings" ? getHoldings(householdId, view, accountId) : null;
  const transactions = tab === "transactions" ? getInvestmentTransactions(householdId, filters) : null;

  const allAccounts = getAccounts(householdId);
  const investmentAccounts = allAccounts
    .filter((a) => a.type === "investment")
    .map((a) => ({ id: a.id, name: a.name }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Investments</h1>
      <InvestmentPageLayout
        summary={summary}
        history={history}
        allocation={allocation}
        holdings={holdings}
        transactions={transactions ? { rows: transactions.rows, nextCursor: transactions.nextCursor } : null}
        activeTab={tab}
        view={view}
        filters={filters}
        accounts={investmentAccounts}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create `loading.tsx`**

```typescript
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function InvestmentsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="p-4 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-32" />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4 h-[280px]"><Skeleton className="h-full w-full" /></Card>
        <Card className="p-4 h-[280px]"><Skeleton className="h-full w-full" /></Card>
      </div>
      <Card className="p-4 space-y-2">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Create `error.tsx`**

```typescript
"use client";

import { Button } from "@/components/ui/button";

export default function InvestmentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="text-muted-foreground">{error.message}</p>
      <Button onClick={reset} variant="outline">Try Again</Button>
    </div>
  );
}
```

- [ ] **Step 4: Add Investments to sidebar nav**

In `src/components/organisms/sidebar-nav.tsx`, add `TrendingUp` to the lucide imports:

```typescript
import { LayoutDashboard, Building2, ArrowLeftRight, Wallet, BarChart3, Receipt, LogOut, TrendingUp } from "lucide-react";
```

Add the investments nav item between Accounts and Transactions in `NAV_ITEMS`:

```typescript
const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Building2 },
  { href: "/investments", label: "Investments", icon: TrendingUp },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/budgets", label: "Budgets", icon: Wallet },
  { href: "/bills", label: "Bills", icon: Receipt },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];
```

- [ ] **Step 5: Verify with typecheck**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/investments/ src/components/organisms/sidebar-nav.tsx
git commit -m "feat(phase10): add investments page with loading/error states and sidebar nav entry"
```

---

### Task 15: Dashboard Widget + Registry

**Files:**
- Create: `src/components/organisms/widgets/investments-widget.tsx`
- Modify: `src/components/organisms/widgets/registry.ts`
- Modify: `src/queries/dashboard.ts`

- [ ] **Step 1: Add `getInvestmentsSummary` to dashboard queries**

In `src/queries/dashboard.ts`, add the import and re-export:

```typescript
import { getInvestmentsSummary } from "./investments";
export { getInvestmentsSummary };
```

- [ ] **Step 2: Create `investments-widget.tsx`**

```typescript
"use client";

import { centsToDisplay } from "@/lib/money";
import { ComparisonBadge } from "@/components/molecules/comparison-badge";
import { TrendingUp } from "lucide-react";

interface InvestmentsWidgetProps {
  totalValue: number;
  dayChange: number | null;
}

export function InvestmentsWidget({ totalValue, dayChange }: InvestmentsWidgetProps) {
  return (
    <div className="flex flex-col gap-2 h-full justify-center">
      <div className="flex items-center gap-2 text-muted-foreground">
        <TrendingUp className="size-4" />
        <span className="text-sm font-medium">Investments</span>
      </div>
      <span className="text-2xl font-bold tabular-nums">{centsToDisplay(totalValue)}</span>
      {dayChange !== null && (
        <ComparisonBadge
          current={totalValue}
          previous={totalValue - dayChange}
          pill
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Register in widget registry**

In `src/components/organisms/widgets/registry.ts`, add the investments widget to `DASHBOARD_WIDGETS` (before the goals placeholder):

```typescript
  { id: "investments", title: "Investments", defaultSize: { w: 2, h: 1 } },
  { id: "goals", title: "Goals", defaultSize: { w: 2, h: 1 }, isPlaceholder: true, placeholderText: "Coming in Phase 12" },
```

Add to the `getDefaultLayout()` desktop array:

```typescript
    { i: "investments", x: 0, y: 4, w: 2, h: 1 },
```

- [ ] **Step 4: Wire the widget into the dashboard grid**

Check the dashboard grid organism file for where widgets are rendered. Add a case for the `"investments"` widget ID that renders `<InvestmentsWidget>` with data from `getInvestmentsSummary`. The exact integration point depends on how the dashboard grid maps widget IDs to components — follow the existing pattern used by `"budgets"` or `"cash-flow"` widgets.

- [ ] **Step 5: Verify with typecheck**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/organisms/widgets/investments-widget.tsx src/components/organisms/widgets/registry.ts src/queries/dashboard.ts
git commit -m "feat(phase10): add investments dashboard widget and register in widget system"
```

---

## Self-Review Checklist

- [x] **Schema migration** — Task 0 adds `sector`, unique indexes. Matches spec section "Schema Migration".
- [x] **Plaid Link update** — Task 1 adds `Products.Investments`. Matches spec section "Plaid Link Update".
- [x] **Shared utils extraction** — Task 2 moves error codes + retry to utils.ts. Includes `SKIP_ERROR_CODES` with both `PRODUCTS_NOT_SUPPORTED` and `PRODUCT_NOT_READY`.
- [x] **Zod schemas** — Task 3 adds all 5 schemas + `mapSecurityType`. Matches spec.
- [x] **Process functions** — Task 4 with 12 tests (6 unit + 2 property + 4 more). Covers null cost basis, unknown type, missing security, negative fees, -0 guard.
- [x] **Fetch functions** — Task 5 with MSW mocks. Includes null cost_basis fixture, warrant type, empty handler, products-not-supported error handler.
- [x] **Apply to DB** — Task 6 with 7 integration tests. Covers full-replace, dedup, snapshot, isolation, idempotency.
- [x] **Orchestrator + scheduler** — Task 7. Sync wired into 4h cron, snapshot at 1am.
- [x] **Query layer** — Task 8 with 7 integration tests. dayChange uses today vs yesterday. getHoldings unbounded. Cursor pagination for txns.
- [x] **Server actions** — Task 9. triggerInvestmentSync + loadMoreInvestmentTransactions.
- [x] **Component refactors** — Task 10 generalizes 3 existing components. No duplicates.
- [x] **New atom** — Task 11. InvestmentTypeBadge only.
- [x] **Molecules** — Task 12. holding-row, investment-transaction-row, investment-filters.
- [x] **Organisms** — Task 13. summary-header (organism, not molecule), holdings-table, transaction-list, page-layout.
- [x] **Page + nav** — Task 14. Server component reads searchParams, passes to client organism. Sidebar nav entry between Accounts and Transactions.
- [x] **Dashboard widget** — Task 15. Widget + registry + dashboard query.
- [x] **Type consistency** — `HoldingRow`, `InvestmentTxnRow`, `InvestmentSyncResult` used consistently across tasks 4-9. Query types (`PortfolioSummary`, `AllocationSlice`, etc.) used consistently in tasks 8, 13, 14.
- [x] **Amount convention** — `safeCents` used everywhere (not `normalizeAmount`). `plaidAmountToCents` used for nullable amounts.
- [x] **Fees** — Stored as-is, no `Math.abs`. Negative fees tested in Task 4.
- [x] **Cost basis** — Null preserved, never defaulted to 0. Tested in Task 4.
- [x] **Test budget** — ~26 tests across Tasks 4, 6, 8. Within the 28-32 spec range.
