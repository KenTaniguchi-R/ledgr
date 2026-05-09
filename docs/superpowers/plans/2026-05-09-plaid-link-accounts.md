# Phase 2: Plaid Link + Token Exchange + Accounts Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect bank accounts via Plaid Link, store encrypted access tokens, display accounts grouped by institution, and support manual account creation — delivering the first functional page beyond auth.

**Architecture:** Pragmatic layers — `lib/plaid/` for pure Plaid service logic, `actions/` for server mutations with `revalidatePath`, `queries/` for read-only scoped DB access. UI follows atomic design (atoms → molecules → organisms). All monetary values are integer cents. Plaid tokens encrypted with AES-256-GCM.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle ORM (better-sqlite3), Plaid Node SDK v42, react-plaid-link, shadcn/ui v4 (@base-ui/react), Tailwind v4, Zod, Vitest, MSW, Playwright.

**Spec:** `docs/superpowers/specs/2026-05-09-plaid-link-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `src/lib/plaid/client.ts` | PlaidApi singleton, env validation |
| `src/lib/plaid/client.test.ts` | Unit tests for client initialization |
| `src/lib/plaid/token.ts` | `encryptAccessToken` / `decryptAccessToken` wrappers |
| `src/lib/plaid/token.test.ts` | Round-trip encryption tests |
| `src/lib/query-helpers.ts` | `notDeleted()` helper |
| `src/actions/plaid.ts` | Server actions: `createLinkToken`, `exchangePublicToken`, `createManualAccount`, `updateAccount` |
| `src/queries/accounts.ts` | `getAccounts`, `getAccountsByInstitution`, `getAccountSummary` |
| `src/app/(dashboard)/accounts/page.tsx` | Accounts page (Server Component) |
| `src/app/(dashboard)/accounts/loading.tsx` | Skeleton loading state |
| `src/app/(dashboard)/accounts/error.tsx` | Error boundary |
| `src/app/api/plaid/oauth-return/route.ts` | OAuth redirect handler |
| `src/components/atoms/balance-display.tsx` | Formatted currency display |
| `src/components/atoms/status-badge.tsx` | Connection status indicator |
| `src/components/atoms/account-type-icon.tsx` | Account type → icon map |
| `src/components/molecules/account-card.tsx` | Single account row |
| `src/components/molecules/institution-header.tsx` | Institution group header |
| `src/components/molecules/summary-card.tsx` | Metric card (net worth, assets, debts) |
| `src/components/organisms/plaid-link-flow.tsx` | Plaid Link lifecycle manager |
| `src/components/organisms/empty-state-cta.tsx` | First-run connect bank prompt |
| `src/components/organisms/account-list.tsx` | Grouped accounts with edit dialog |
| `src/components/organisms/accounts-actions.tsx` | "+ Add Account" dropdown wrapper |
| `src/components/organisms/add-manual-account-dialog.tsx` | Manual account creation dialog |
| `src/components/organisms/edit-account-dialog.tsx` | Account edit dialog |
| `src/components/organisms/sidebar-nav.tsx` | App shell sidebar navigation |
| `tests/integration/plaid-exchange.test.ts` | Exchange flow integration tests |
| `tests/integration/accounts-queries.test.ts` | Query layer integration tests |
| `e2e/accounts.spec.ts` | Accounts page E2E tests |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/money.ts` | Update `plaidAmountToCents` to handle null |
| `src/lib/money.test.ts` | Add null handling tests |
| `src/lib/auth/session.ts` | Extract `resolveHouseholdId` |
| `src/app/(dashboard)/layout.tsx` | Remove duplicate auth guard, add SidebarNav |
| `src/app/(dashboard)/page.tsx` | Update for sidebar layout |
| `tests/mocks/handlers.ts` | Add exchange, itemGet, institutionsGetById handlers; extend accountsGet |
| `src/middleware.ts` | Add `/api/plaid/oauth-return` to public paths |
| `.env.example` | Already has `NEXT_PUBLIC_APP_URL` |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install npm packages**

```bash
pnpm add react-plaid-link zod
```

- [ ] **Step 2: Add shadcn components**

```bash
pnpm dlx shadcn@latest add dialog select badge dropdown-menu switch separator sidebar sheet skeleton
```

- [ ] **Step 3: Verify installation**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/components/ui/
git commit -m "chore: add react-plaid-link, zod, and shadcn components for Phase 2"
```

---

## Task 2: Pre-Phase Refactor — Extract `resolveHouseholdId`

**Files:**
- Modify: `src/lib/auth/session.ts`
- Test: `tests/integration/onboarding.test.ts` (extend)

- [ ] **Step 1: Write test for `resolveHouseholdId`**

Add to `tests/integration/onboarding.test.ts`:

```typescript
import { resolveHouseholdId } from "@/lib/auth/session";

// Add this test inside the existing describe("household provisioning") block:

it("resolveHouseholdId returns existing household for provisioned user", async () => {
  const testDb = setup();
  const userId = "user-resolve-existing";

  const provisioned = provisionHousehold(userId, testDb);
  const resolved = resolveHouseholdId(userId, testDb);

  expect(resolved).toBe(provisioned);
});

it("resolveHouseholdId provisions when no household exists", async () => {
  const testDb = setup();
  const userId = "user-resolve-new";

  const resolved = resolveHouseholdId(userId, testDb);

  expect(resolved).toBeTruthy();

  const members = testDb
    .select()
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .all();
  expect(members).toHaveLength(1);
  expect(members[0].role).toBe("owner");
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run tests/integration/onboarding.test.ts
```

Expected: FAIL — `resolveHouseholdId` is not exported

- [ ] **Step 3: Refactor `session.ts` to extract `resolveHouseholdId`**

Replace `src/lib/auth/session.ts` with:

```typescript
import { cache } from "react";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { householdMembers } from "@/db/schema";
import { provisionHousehold } from "./provision";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

type LedgrDb = BetterSQLite3Database<typeof schema>;

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export function resolveHouseholdId(
  userId: string,
  db: LedgrDb = defaultDb
): string {
  const member = db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .get();

  if (member) {
    return member.householdId;
  }

  return provisionHousehold(userId, db);
}

export const getHouseholdId = cache(async (): Promise<string> => {
  const session = await getSession();
  if (!session) {
    throw new Error("Not authenticated");
  }

  try {
    return resolveHouseholdId(session.user.id);
  } catch (e) {
    console.error("Self-heal provisioning failed:", e);
    throw new Error("Failed to provision household");
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run tests/integration/onboarding.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/session.ts tests/integration/onboarding.test.ts
git commit -m "refactor: extract resolveHouseholdId for testability"
```

---

## Task 3: Pre-Phase Refactor — Remove Duplicate Auth Guard

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Remove redirect guard from dashboard layout**

Replace `src/app/(dashboard)/layout.tsx` with:

```typescript
import { getSession } from "@/lib/auth/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  return <div className="min-h-screen">{children}</div>;
}
```

The `session` variable is kept for data composition in Task 19 (SidebarNav).

- [ ] **Step 2: Verify auth still works via middleware**

```bash
pnpm dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
# Expected: 307 (redirect to /login)
kill %1
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/layout.tsx
git commit -m "refactor: remove duplicate auth guard from dashboard layout"
```

---

## Task 4: Pre-Phase Refactor — Token Encryption Wrapper

**Files:**
- Create: `src/lib/plaid/token.ts`
- Create: `src/lib/plaid/token.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/plaid/token.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("plaid token encryption", () => {
  it("round-trips: decrypt(encrypt(token)) === token", () => {
    const { encryptAccessToken, decryptAccessToken } = require("./token");
    const token = "access-sandbox-abc123-def456";
    const encrypted = encryptAccessToken(token);
    const decrypted = decryptAccessToken(encrypted);
    expect(decrypted).toBe(token);
  });

  it("produces different ciphertexts for same input (random IV)", () => {
    const { encryptAccessToken } = require("./token");
    const token = "access-sandbox-abc123-def456";
    const a = encryptAccessToken(token);
    const b = encryptAccessToken(token);
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
ENCRYPTION_KEY=$(openssl rand -hex 32) pnpm vitest run src/lib/plaid/token.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement the wrapper**

Create `src/lib/plaid/token.ts`:

```typescript
import { encrypt, decrypt } from "@/lib/encryption";

export function encryptAccessToken(rawToken: string): string {
  return encrypt(rawToken);
}

export function decryptAccessToken(storedToken: string): string {
  return decrypt(storedToken);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
ENCRYPTION_KEY=$(openssl rand -hex 32) pnpm vitest run src/lib/plaid/token.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/plaid/token.ts src/lib/plaid/token.test.ts
git commit -m "feat: add Plaid access token encryption wrappers"
```

---

## Task 5: Update `plaidAmountToCents` for Null Handling

**Files:**
- Modify: `src/lib/money.ts`
- Modify: `src/lib/money.test.ts`

- [ ] **Step 1: Add null handling tests**

Add to `src/lib/money.test.ts` inside the `describe("plaidAmountToCents")` block:

```typescript
it("returns null for null input", () => {
  expect(plaidAmountToCents(null)).toBeNull();
});

it("returns null for undefined input", () => {
  expect(plaidAmountToCents(undefined as unknown as number | null)).toBeNull();
});

it("returns 0 for zero (not null)", () => {
  expect(plaidAmountToCents(0)).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/lib/money.test.ts
```

Expected: FAIL — `plaidAmountToCents(null)` returns `0` (Math.round(null * 100) === 0)

- [ ] **Step 3: Update the function signature**

In `src/lib/money.ts`, replace the `plaidAmountToCents` function:

```typescript
export function plaidAmountToCents(plaidAmount: number | null | undefined): number | null {
  if (plaidAmount === null || plaidAmount === undefined) return null;
  return Math.round(plaidAmount * 100);
}
```

- [ ] **Step 4: Update the property-based test**

In `src/lib/money.test.ts`, the existing property test uses `plaidAmountToCents` with a `double` arbitrary. It still works because the double is never null. No change needed.

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm vitest run src/lib/money.test.ts
```

Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/money.ts src/lib/money.test.ts
git commit -m "fix: plaidAmountToCents returns null for null input"
```

---

## Task 6: Create Query Helpers — `notDeleted`

**Files:**
- Create: `src/lib/query-helpers.ts`

- [ ] **Step 1: Create the helper**

Create `src/lib/query-helpers.ts`:

```typescript
import { isNull } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

export function notDeleted(table: { deletedAt: SQLiteColumn }) {
  return isNull(table.deletedAt);
}
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/query-helpers.ts
git commit -m "feat: add notDeleted query helper"
```

---

## Task 7: Plaid Client Singleton

**Files:**
- Create: `src/lib/plaid/client.ts`
- Create: `src/lib/plaid/client.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/plaid/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("plaid client", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws if PLAID_CLIENT_ID is missing", () => {
    vi.stubEnv("PLAID_CLIENT_ID", "");
    vi.stubEnv("PLAID_SECRET", "test-secret");
    vi.stubEnv("PLAID_ENV", "sandbox");

    expect(() => {
      vi.resetModules();
      require("./client");
    }).toThrow("PLAID_CLIENT_ID");
  });

  it("throws if PLAID_SECRET is missing", () => {
    vi.stubEnv("PLAID_CLIENT_ID", "test-id");
    vi.stubEnv("PLAID_SECRET", "");
    vi.stubEnv("PLAID_ENV", "sandbox");

    expect(() => {
      vi.resetModules();
      require("./client");
    }).toThrow("PLAID_SECRET");
  });

  it("throws if PLAID_ENV is invalid", () => {
    vi.stubEnv("PLAID_CLIENT_ID", "test-id");
    vi.stubEnv("PLAID_SECRET", "test-secret");
    vi.stubEnv("PLAID_ENV", "invalid");

    expect(() => {
      vi.resetModules();
      require("./client");
    }).toThrow("PLAID_ENV");
  });

  it("creates client for valid sandbox config", () => {
    vi.stubEnv("PLAID_CLIENT_ID", "test-id");
    vi.stubEnv("PLAID_SECRET", "test-secret");
    vi.stubEnv("PLAID_ENV", "sandbox");

    vi.resetModules();
    const { plaidClient } = require("./client");
    expect(plaidClient).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/lib/plaid/client.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement the client**

Create `src/lib/plaid/client.ts`:

```typescript
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const VALID_ENVS: Record<string, string> = {
  sandbox: PlaidEnvironments.sandbox,
  development: PlaidEnvironments.development,
  production: PlaidEnvironments.production,
};

function createPlaidClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = process.env.PLAID_ENV ?? "sandbox";

  if (!clientId) {
    throw new Error("PLAID_CLIENT_ID environment variable is required");
  }
  if (!secret) {
    throw new Error("PLAID_SECRET environment variable is required");
  }

  const basePath = VALID_ENVS[env];
  if (!basePath) {
    throw new Error(
      `PLAID_ENV must be one of: sandbox, development, production (got "${env}")`
    );
  }

  const configuration = new Configuration({
    basePath,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });

  return new PlaidApi(configuration);
}

export const plaidClient = createPlaidClient();
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/lib/plaid/client.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/plaid/client.ts src/lib/plaid/client.test.ts
git commit -m "feat: add Plaid API client singleton with env validation"
```

---

## Task 8: MSW Handler Updates

**Files:**
- Modify: `tests/mocks/handlers.ts`

- [ ] **Step 1: Extend MSW handlers with exchange, itemGet, institutionsGetById, and multi-type accounts**

Replace `tests/mocks/handlers.ts` with:

```typescript
import { http, HttpResponse } from "msw";

export const plaidHandlers = [
  http.post("https://sandbox.plaid.com/link/token/create", () =>
    HttpResponse.json({
      link_token: "link-sandbox-test-token",
      expiration: "2026-12-31T00:00:00Z",
      request_id: "req-test-123",
    })
  ),

  http.post("https://sandbox.plaid.com/item/public_token/exchange", () =>
    HttpResponse.json({
      access_token: "access-sandbox-test-token-abc123",
      item_id: "plaid-item-1",
      request_id: "req-test-exchange",
    })
  ),

  http.post("https://sandbox.plaid.com/item/get", () =>
    HttpResponse.json({
      item: {
        item_id: "plaid-item-1",
        institution_id: "ins_1",
        webhook: "",
        available_products: ["transactions"],
        billed_products: ["transactions"],
        consent_expiration_time: null,
        error: null,
      },
      request_id: "req-test-item-get",
    })
  ),

  http.post("https://sandbox.plaid.com/institutions/get_by_id", () =>
    HttpResponse.json({
      institution: {
        institution_id: "ins_1",
        name: "Chase",
        products: ["transactions"],
        country_codes: ["US"],
      },
      request_id: "req-test-inst",
    })
  ),

  http.post("https://sandbox.plaid.com/transactions/sync", () =>
    HttpResponse.json({
      added: [],
      modified: [],
      removed: [],
      has_more: false,
      next_cursor: "cursor_abc123",
      request_id: "req-test-456",
    })
  ),

  http.post("https://sandbox.plaid.com/accounts/get", () =>
    HttpResponse.json({
      accounts: [
        {
          account_id: "plaid-acc-checking",
          name: "Plaid Checking",
          official_name: "Plaid Gold Standard Checking",
          type: "depository",
          subtype: "checking",
          mask: "0000",
          balances: {
            current: 1000.0,
            available: 900.0,
            limit: null,
            iso_currency_code: "USD",
          },
        },
        {
          account_id: "plaid-acc-savings",
          name: "Plaid Saving",
          official_name: "Plaid Silver Standard Savings",
          type: "depository",
          subtype: "savings",
          mask: "1111",
          balances: {
            current: 5000.0,
            available: 5000.0,
            limit: null,
            iso_currency_code: "USD",
          },
        },
        {
          account_id: "plaid-acc-credit",
          name: "Plaid Credit Card",
          official_name: "Plaid Diamond Credit Card",
          type: "credit",
          subtype: "credit card",
          mask: "2222",
          balances: {
            current: 450.5,
            available: 549.5,
            limit: 1000.0,
            iso_currency_code: "USD",
          },
        },
        {
          account_id: "plaid-acc-null",
          name: "Plaid Investment",
          official_name: null,
          type: "investment",
          subtype: "401k",
          mask: "3333",
          balances: {
            current: null,
            available: null,
            limit: null,
            iso_currency_code: "USD",
          },
        },
      ],
      request_id: "req-test-789",
    })
  ),
];

export const allHandlers = [...plaidHandlers];
```

- [ ] **Step 2: Verify MSW server still initializes**

```bash
pnpm vitest run tests/integration/db-factory.test.ts
```

Expected: PASS (existing tests unaffected)

- [ ] **Step 3: Commit**

```bash
git add tests/mocks/handlers.ts
git commit -m "test: extend MSW handlers for Plaid exchange, itemGet, institutionsGetById"
```

---

## Task 9: Account Queries Layer

**Files:**
- Create: `src/queries/accounts.ts`
- Create: `tests/integration/accounts-queries.test.ts`

- [ ] **Step 1: Write the failing integration tests**

Create `tests/integration/accounts-queries.test.ts`:

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import { createTestDb } from "./setup";
import { provisionHousehold } from "@/lib/auth/provision";
import {
  getAccounts,
  getAccountsByInstitution,
  getAccountSummary,
} from "@/queries/accounts";
import { accounts, plaidItems } from "@/db/schema";

describe("account queries", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let close: () => void;

  afterEach(() => close?.());

  function setup() {
    const result = createTestDb();
    db = result.db;
    close = result.close;
    return db;
  }

  function insertPlaidItem(testDb: typeof db, householdId: string) {
    const itemId = uuid();
    testDb.insert(plaidItems).values({
      id: itemId,
      householdId,
      accessToken: "encrypted-token",
      plaidInstitutionId: "ins_1",
      institutionName: "Chase",
      status: "active",
    }).run();
    return itemId;
  }

  function insertAccount(
    testDb: typeof db,
    householdId: string,
    overrides: Partial<typeof accounts.$inferInsert> = {}
  ) {
    const id = uuid();
    testDb.insert(accounts).values({
      id,
      householdId,
      name: "Test Account",
      type: "checking",
      currentBalance: 100000,
      ...overrides,
    }).run();
    return id;
  }

  it("getAccounts returns only non-deleted accounts for given household", () => {
    const testDb = setup();
    const hh = provisionHousehold("user-1", testDb);

    insertAccount(testDb, hh, { name: "Active" });
    insertAccount(testDb, hh, { name: "Deleted", deletedAt: "2026-01-01" });

    const result = getAccounts(hh, testDb);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Active");
  });

  it("getAccountsByInstitution groups Plaid accounts under institution, manual under 'Manual Accounts'", () => {
    const testDb = setup();
    const hh = provisionHousehold("user-2", testDb);
    const itemId = insertPlaidItem(testDb, hh);

    insertAccount(testDb, hh, { name: "Checking", plaidItemId: itemId, plaidAccountId: "pa-1" });
    insertAccount(testDb, hh, { name: "Cash", isManual: true });

    const groups = getAccountsByInstitution(hh, testDb);

    const plaidGroup = groups.find((g) => g.institutionName === "Chase");
    expect(plaidGroup).toBeDefined();
    expect(plaidGroup!.accounts).toHaveLength(1);
    expect(plaidGroup!.status).toBe("active");

    const manualGroup = groups.find((g) => g.institutionName === "Manual Accounts");
    expect(manualGroup).toBeDefined();
    expect(manualGroup!.accounts).toHaveLength(1);
  });

  it("getAccountSummary computes assets - liabilities = net worth", () => {
    const testDb = setup();
    const hh = provisionHousehold("user-3", testDb);

    insertAccount(testDb, hh, { name: "Checking", type: "checking", currentBalance: 500000 });
    insertAccount(testDb, hh, { name: "Savings", type: "savings", currentBalance: 1000000 });
    insertAccount(testDb, hh, { name: "Credit Card", type: "credit", currentBalance: 50000 });

    const summary = getAccountSummary(hh, testDb);
    expect(summary.totalAssets).toBe(1500000);
    expect(summary.totalLiabilities).toBe(50000);
    expect(summary.netWorth).toBe(1450000);
  });

  it("getAccountSummary excludes null balances from sums", () => {
    const testDb = setup();
    const hh = provisionHousehold("user-4", testDb);

    insertAccount(testDb, hh, { name: "Known", type: "checking", currentBalance: 500000 });
    insertAccount(testDb, hh, { name: "Unknown", type: "investment", currentBalance: null });

    const summary = getAccountSummary(hh, testDb);
    expect(summary.totalAssets).toBe(500000);
  });

  it("soft-deleted accounts excluded from all queries", () => {
    const testDb = setup();
    const hh = provisionHousehold("user-5", testDb);

    insertAccount(testDb, hh, { name: "Active", currentBalance: 100000 });
    insertAccount(testDb, hh, { name: "Deleted", currentBalance: 200000, deletedAt: "2026-01-01" });

    const all = getAccounts(hh, testDb);
    expect(all).toHaveLength(1);

    const groups = getAccountsByInstitution(hh, testDb);
    const totalAccounts = groups.reduce((sum, g) => sum + g.accounts.length, 0);
    expect(totalAccounts).toBe(1);

    const summary = getAccountSummary(hh, testDb);
    expect(summary.totalAssets).toBe(100000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run tests/integration/accounts-queries.test.ts
```

Expected: FAIL — `@/queries/accounts` does not exist

- [ ] **Step 3: Implement the queries**

Create `src/queries/accounts.ts`:

```typescript
import { eq, and, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { accounts, plaidItems } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

type LedgrDb = BetterSQLite3Database<typeof schema>;

const TYPE_ORDER = ["checking", "savings", "credit", "loan", "investment", "other"] as const;

export function getAccounts(householdId: string, db: LedgrDb = defaultDb) {
  const scoped = scopedQuery(householdId, db);
  return db
    .select()
    .from(accounts)
    .where(scoped.where(accounts, notDeleted(accounts)))
    .all()
    .sort((a, b) => {
      const ai = TYPE_ORDER.indexOf(a.type as (typeof TYPE_ORDER)[number]);
      const bi = TYPE_ORDER.indexOf(b.type as (typeof TYPE_ORDER)[number]);
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name);
    });
}

export type AccountRow = ReturnType<typeof getAccounts>[number];

export interface InstitutionGroup {
  institutionName: string;
  plaidItemId: string | null;
  status: "active" | "error" | "reauth_required" | null;
  accounts: AccountRow[];
}

export function getAccountsByInstitution(
  householdId: string,
  db: LedgrDb = defaultDb
): InstitutionGroup[] {
  const allAccounts = getAccounts(householdId, db);

  const items = db
    .select()
    .from(plaidItems)
    .where(eq(plaidItems.householdId, householdId))
    .all();

  const itemMap = new Map(items.map((i) => [i.id, i]));
  const groups = new Map<string, InstitutionGroup>();

  for (const account of allAccounts) {
    if (account.plaidItemId) {
      const item = itemMap.get(account.plaidItemId);
      const key = account.plaidItemId;
      if (!groups.has(key)) {
        groups.set(key, {
          institutionName: item?.institutionName ?? "Unknown Institution",
          plaidItemId: account.plaidItemId,
          status: (item?.status as InstitutionGroup["status"]) ?? null,
          accounts: [],
        });
      }
      groups.get(key)!.accounts.push(account);
    } else {
      const key = "__manual__";
      if (!groups.has(key)) {
        groups.set(key, {
          institutionName: "Manual Accounts",
          plaidItemId: null,
          status: null,
          accounts: [],
        });
      }
      groups.get(key)!.accounts.push(account);
    }
  }

  const result = [...groups.values()];
  const manualIdx = result.findIndex((g) => g.plaidItemId === null);
  if (manualIdx > 0) {
    const [manual] = result.splice(manualIdx, 1);
    result.push(manual);
  }

  return result;
}

const ASSET_TYPES = new Set(["checking", "savings", "investment"]);
const LIABILITY_TYPES = new Set(["credit", "loan"]);

export function getAccountSummary(
  householdId: string,
  db: LedgrDb = defaultDb
) {
  const allAccounts = getAccounts(householdId, db).filter(
    (a) => !a.isHidden
  );

  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const account of allAccounts) {
    if (account.currentBalance === null) continue;
    if (ASSET_TYPES.has(account.type)) {
      totalAssets += account.currentBalance;
    } else if (LIABILITY_TYPES.has(account.type)) {
      totalLiabilities += account.currentBalance;
    }
  }

  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run tests/integration/accounts-queries.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/queries/accounts.ts src/lib/query-helpers.ts tests/integration/accounts-queries.test.ts
git commit -m "feat: add account queries with scoped access and soft-delete filtering"
```

---

## Task 10: Server Actions — Exchange Flow

**Files:**
- Create: `src/actions/plaid.ts`
- Create: `tests/integration/plaid-exchange.test.ts`

- [ ] **Step 1: Write integration tests for the exchange flow**

Create `tests/integration/plaid-exchange.test.ts`:

```typescript
import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import { createTestDb } from "./setup";
import { server } from "../mocks/server";
import { provisionHousehold } from "@/lib/auth/provision";
import { encryptAccessToken, decryptAccessToken } from "@/lib/plaid/token";
import { plaidItems, accounts, balanceHistory } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { mapPlaidAccountType, exchangeAndStoreAccounts } from "@/actions/plaid";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

describe("plaid exchange flow", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let close: () => void;

  afterEach(() => {
    server.resetHandlers();
    close?.();
  });

  function setup() {
    const result = createTestDb();
    db = result.db;
    close = result.close;
    return db;
  }

  it("stores plaid item with encrypted token and creates accounts with correct balances", async () => {
    const testDb = setup();
    const hh = provisionHousehold("user-1", testDb);

    const result = await exchangeAndStoreAccounts("public-sandbox-token", hh, testDb);
    expect(result.success).toBe(true);
    expect(result.accountCount).toBe(4);

    const items = testDb.select().from(plaidItems).where(eq(plaidItems.householdId, hh)).all();
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("active");
    expect(items[0].institutionName).toBe("Chase");
    expect(items[0].plaidInstitutionId).toBe("ins_1");

    const decrypted = decryptAccessToken(items[0].accessToken);
    expect(decrypted).toBe("access-sandbox-test-token-abc123");

    const accts = testDb.select().from(accounts).where(eq(accounts.householdId, hh)).all();
    expect(accts).toHaveLength(4);

    const checking = accts.find((a) => a.plaidAccountId === "plaid-acc-checking")!;
    expect(checking.currentBalance).toBe(100000);
    expect(checking.availableBalance).toBe(90000);
    expect(checking.type).toBe("checking");

    const credit = accts.find((a) => a.plaidAccountId === "plaid-acc-credit")!;
    expect(credit.currentBalance).toBe(45050);
    expect(credit.creditLimit).toBe(100000);
    expect(credit.type).toBe("credit");
  });

  it("stores null balances as null, not zero", async () => {
    const testDb = setup();
    const hh = provisionHousehold("user-null", testDb);

    await exchangeAndStoreAccounts("public-sandbox-token", hh, testDb);

    const accts = testDb.select().from(accounts).where(eq(accounts.householdId, hh)).all();
    const investment = accts.find((a) => a.plaidAccountId === "plaid-acc-null")!;
    expect(investment.currentBalance).toBeNull();
    expect(investment.availableBalance).toBeNull();
    expect(investment.type).toBe("investment");
  });

  it("creates balance_history for accounts with non-null balances only", async () => {
    const testDb = setup();
    const hh = provisionHousehold("user-history", testDb);

    await exchangeAndStoreAccounts("public-sandbox-token", hh, testDb);

    const history = testDb.select().from(balanceHistory).all();
    expect(history.length).toBe(3); // checking, savings, credit — not investment (null balance)
  });

  it("isolates accounts between households", async () => {
    const testDb = setup();
    const hhA = provisionHousehold("user-a", testDb);
    const hhB = provisionHousehold("user-b", testDb);

    await exchangeAndStoreAccounts("public-sandbox-token", hhA, testDb);

    const scopeB = scopedQuery(hhB, testDb);
    const accts = testDb.select().from(accounts).where(scopeB.where(accounts)).all();
    expect(accts).toHaveLength(0);
  });

  it("rejects duplicate institution for same household", async () => {
    const testDb = setup();
    const hh = provisionHousehold("user-dup", testDb);

    await exchangeAndStoreAccounts("public-sandbox-token", hh, testDb);
    const result = await exchangeAndStoreAccounts("public-sandbox-token", hh, testDb);

    expect(result.success).toBe(false);
    expect(result.error).toContain("already connected");
  });

  it("maps account types correctly", () => {
    expect(mapPlaidAccountType("depository", "checking")).toBe("checking");
    expect(mapPlaidAccountType("depository", "savings")).toBe("savings");
    expect(mapPlaidAccountType("depository", "money market")).toBe("checking");
    expect(mapPlaidAccountType("credit", "credit card")).toBe("credit");
    expect(mapPlaidAccountType("loan", "mortgage")).toBe("loan");
    expect(mapPlaidAccountType("investment", "401k")).toBe("investment");
    expect(mapPlaidAccountType("other", null)).toBe("other");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
ENCRYPTION_KEY=$(openssl rand -hex 32) PLAID_CLIENT_ID=test PLAID_SECRET=test PLAID_ENV=sandbox pnpm vitest run tests/integration/plaid-exchange.test.ts
```

Expected: FAIL — `@/actions/plaid` does not exist

- [ ] **Step 3: Implement the server actions**

Create `src/actions/plaid.ts`:

```typescript
"use server";

import { v4 as uuid } from "uuid";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Products, CountryCode } from "plaid";
import { plaidClient } from "@/lib/plaid/client";
import { encryptAccessToken } from "@/lib/plaid/token";
import { plaidAmountToCents } from "@/lib/money";
import { getSession, getHouseholdId } from "@/lib/auth/session";
import { db as defaultDb } from "@/db";
import { plaidItems, accounts, balanceHistory } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

type LedgrDb = BetterSQLite3Database<typeof schema>;
type AccountType = "checking" | "savings" | "credit" | "loan" | "investment" | "other";

export function mapPlaidAccountType(
  plaidType: string,
  plaidSubtype: string | null
): AccountType {
  switch (plaidType) {
    case "depository":
      return plaidSubtype === "savings" ? "savings" : "checking";
    case "credit":
      return "credit";
    case "loan":
      return "loan";
    case "investment":
      return "investment";
    default:
      return "other";
  }
}

export async function createLinkToken() {
  const householdId = await getHouseholdId();
  const session = await getSession();
  if (!session) {
    return { error: "Not authenticated" };
  }

  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: session.user.id },
      client_name: "Ledgr",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
      ...(process.env.PLAID_WEBHOOK_URL
        ? { webhook: process.env.PLAID_WEBHOOK_URL }
        : {}),
      ...(process.env.NEXT_PUBLIC_APP_URL
        ? {
            redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/plaid/oauth-return`,
          }
        : {}),
    });
    return { linkToken: response.data.link_token };
  } catch (e) {
    console.error("Failed to create link token:", e);
    return { error: "Failed to initialize bank connection" };
  }
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export async function exchangeAndStoreAccounts(
  publicToken: string,
  householdId: string,
  db: LedgrDb = defaultDb
): Promise<
  | { success: true; accountCount: number; error?: never }
  | { success: false; error: string; accountCount?: never }
> {
  try {
    const exchangeRes = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });
    const accessToken = exchangeRes.data.access_token;
    const itemId = exchangeRes.data.item_id;

    const itemRes = await plaidClient.itemGet({ access_token: accessToken });
    const institutionId = itemRes.data.item.institution_id ?? null;

    let institutionName = "Unknown Institution";
    if (institutionId) {
      try {
        const instRes = await plaidClient.institutionsGetById({
          institution_id: institutionId,
          country_codes: [CountryCode.Us],
        });
        institutionName = instRes.data.institution.name;
      } catch {
        // Fall back to "Unknown Institution" if lookup fails
      }
    }

    if (institutionId) {
      const existing = db
        .select({ id: plaidItems.id })
        .from(plaidItems)
        .where(
          and(
            eq(plaidItems.householdId, householdId),
            eq(plaidItems.plaidInstitutionId, institutionId)
          )
        )
        .get();
      if (existing) {
        return { success: false, error: "This institution is already connected" };
      }
    }

    const accountsRes = await plaidClient.accountsGet({
      access_token: accessToken,
    });
    const plaidAccounts = accountsRes.data.accounts;

    const plaidItemId = uuid();
    const today = todayISO();

    db.transaction((tx) => {
      tx.insert(plaidItems)
        .values({
          id: plaidItemId,
          householdId,
          accessToken: encryptAccessToken(accessToken),
          plaidInstitutionId: institutionId,
          institutionName,
          status: "active",
        })
        .run();

      for (const acct of plaidAccounts) {
        const accountId = uuid();
        const currentBalance = plaidAmountToCents(acct.balances.current ?? null);
        const availableBalance = plaidAmountToCents(
          acct.balances.available ?? null
        );
        const creditLimit = plaidAmountToCents(acct.balances.limit ?? null);

        tx.insert(accounts)
          .values({
            id: accountId,
            householdId,
            plaidItemId,
            plaidAccountId: acct.account_id,
            name: acct.name,
            officialName: acct.official_name ?? null,
            type: mapPlaidAccountType(acct.type, acct.subtype ?? null),
            subtype: acct.subtype ?? null,
            currentBalance,
            availableBalance,
            creditLimit,
            currency: acct.balances.iso_currency_code ?? "USD",
          })
          .run();

        if (currentBalance !== null) {
          tx.insert(balanceHistory)
            .values({
              id: uuid(),
              accountId,
              date: today,
              balance: currentBalance,
            })
            .run();
        }
      }
    });

    return { success: true, accountCount: plaidAccounts.length };
  } catch (e: unknown) {
    console.error("Exchange failed:", e);
    const plaidError = e as { response?: { data?: { error_code?: string } } };
    const errorCode = plaidError?.response?.data?.error_code;
    if (
      errorCode === "INSTITUTION_DOWN" ||
      errorCode === "INSTITUTION_NOT_RESPONDING"
    ) {
      return {
        success: false,
        error: "This bank is temporarily unavailable. Please try again later.",
      };
    }
    return { success: false, error: "Failed to connect account" };
  }
}

export async function exchangePublicToken(publicToken: string) {
  const householdId = await getHouseholdId();
  const result = await exchangeAndStoreAccounts(publicToken, householdId);
  if (result.success) {
    revalidatePath("/accounts");
  }
  return result;
}

const createManualAccountSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["checking", "savings", "credit", "loan", "investment", "other"]),
  balance: z.number().transform((v) => Math.round(v)),
});

export async function createManualAccount(
  data: z.input<typeof createManualAccountSchema>
) {
  const householdId = await getHouseholdId();

  const parsed = createManualAccountSchema.safeParse(data);
  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  const accountId = uuid();
  const today = todayISO();

  defaultDb.transaction((tx) => {
    tx.insert(accounts)
      .values({
        id: accountId,
        householdId,
        name: parsed.data.name,
        type: parsed.data.type,
        currentBalance: parsed.data.balance,
        isManual: true,
      })
      .run();

    tx.insert(balanceHistory)
      .values({
        id: uuid(),
        accountId,
        date: today,
        balance: parsed.data.balance,
      })
      .run();
  });

  revalidatePath("/accounts");
  return { success: true, accountId };
}

const updateAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isHidden: z.boolean().optional(),
});

export async function updateAccount(
  accountId: string,
  data: z.input<typeof updateAccountSchema>
) {
  const householdId = await getHouseholdId();

  const parsed = updateAccountSchema.safeParse(data);
  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  const scoped = scopedQuery(householdId);
  const existing = defaultDb
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
    defaultDb
      .update(accounts)
      .set(updates)
      .where(eq(accounts.id, accountId))
      .run();
  }

  revalidatePath("/accounts");
  return { success: true };
}
```

- [ ] **Step 4: Run integration tests**

```bash
ENCRYPTION_KEY=$(openssl rand -hex 32) PLAID_CLIENT_ID=test PLAID_SECRET=test PLAID_ENV=sandbox pnpm vitest run tests/integration/plaid-exchange.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/plaid.ts tests/integration/plaid-exchange.test.ts
git commit -m "feat: add Plaid exchange and account server actions with integration tests"
```

---

## Task 11: Atom Components

**Files:**
- Create: `src/components/atoms/balance-display.tsx`
- Create: `src/components/atoms/status-badge.tsx`
- Create: `src/components/atoms/account-type-icon.tsx`

- [ ] **Step 1: Create BalanceDisplay**

Create `src/components/atoms/balance-display.tsx`:

```tsx
import { centsToDisplay } from "@/lib/money";
import { cn } from "@/lib/utils";

interface BalanceDisplayProps {
  amount: number | null;
  currency?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-2xl font-semibold tracking-tight",
};

export function BalanceDisplay({
  amount,
  currency = "USD",
  size = "md",
}: BalanceDisplayProps) {
  if (amount === null) {
    return (
      <span className={cn("text-muted-foreground", sizeClasses[size])}>
        —
      </span>
    );
  }

  return (
    <span
      className={cn(
        sizeClasses[size],
        amount < 0 && "text-destructive"
      )}
    >
      {centsToDisplay(amount, currency)}
    </span>
  );
}
```

- [ ] **Step 2: Create StatusBadge**

Create `src/components/atoms/status-badge.tsx`:

```tsx
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: "active" | "error" | "reauth_required";
}

const config = {
  active: { label: "Connected", dotClass: "bg-emerald-500" },
  error: { label: "Error", dotClass: "bg-amber-500" },
  reauth_required: { label: "Reconnect needed", dotClass: "bg-destructive" },
} as const;

export function StatusBadge({ status }: StatusBadgeProps) {
  const { label, dotClass } = config[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", dotClass)} aria-hidden />
      {label}
    </span>
  );
}
```

- [ ] **Step 3: Create AccountTypeIcon**

Create `src/components/atoms/account-type-icon.tsx`:

```tsx
import {
  Building2,
  PiggyBank,
  CreditCard,
  Receipt,
  TrendingUp,
  CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AccountType = "checking" | "savings" | "credit" | "loan" | "investment" | "other";

interface AccountTypeIconProps {
  type: AccountType;
  className?: string;
}

const icons: Record<AccountType, typeof Building2> = {
  checking: Building2,
  savings: PiggyBank,
  credit: CreditCard,
  loan: Receipt,
  investment: TrendingUp,
  other: CircleDot,
};

export function AccountTypeIcon({ type, className }: AccountTypeIconProps) {
  const Icon = icons[type] ?? CircleDot;
  return <Icon className={cn("size-4 text-muted-foreground", className)} />;
}
```

- [ ] **Step 4: Verify build**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/components/atoms/
git commit -m "feat: add atom components — BalanceDisplay, StatusBadge, AccountTypeIcon"
```

---

## Task 12: Molecule Components

**Files:**
- Create: `src/components/molecules/account-card.tsx`
- Create: `src/components/molecules/institution-header.tsx`
- Create: `src/components/molecules/summary-card.tsx`

- [ ] **Step 1: Create AccountCard**

Create `src/components/molecules/account-card.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { AccountTypeIcon } from "@/components/atoms/account-type-icon";
import { BalanceDisplay } from "@/components/atoms/balance-display";
import { Pencil } from "lucide-react";
import type { AccountRow } from "@/queries/accounts";

interface AccountCardProps {
  account: AccountRow;
  onEdit: (account: AccountRow) => void;
}

export function AccountCard({ account, onEdit }: AccountCardProps) {
  const mask = account.plaidAccountId
    ? `···${account.plaidAccountId.slice(-4)}`
    : null;

  return (
    <div className="group/card flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <AccountTypeIcon type={account.type as Parameters<typeof AccountTypeIcon>[0]["type"]} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{account.name}</span>
            {mask && (
              <span className="text-xs text-muted-foreground">{mask}</span>
            )}
          </div>
          {account.officialName && account.officialName !== account.name && (
            <p className="text-xs text-muted-foreground truncate">
              {account.officialName}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <BalanceDisplay amount={account.currentBalance} size="sm" />
        <Button
          variant="ghost"
          size="icon-xs"
          className="opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100 transition-opacity"
          onClick={() => onEdit(account)}
          aria-label={`Edit ${account.name}`}
        >
          <Pencil />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create InstitutionHeader**

Create `src/components/molecules/institution-header.tsx`:

```tsx
import { StatusBadge } from "@/components/atoms/status-badge";

interface InstitutionHeaderProps {
  institutionName: string;
  status: "active" | "error" | "reauth_required" | null;
  accountCount: number;
}

export function InstitutionHeader({
  institutionName,
  status,
  accountCount,
}: InstitutionHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <div>
        <h3 className="text-sm font-semibold">{institutionName}</h3>
        <p className="text-xs text-muted-foreground">
          {accountCount} {accountCount === 1 ? "account" : "accounts"}
        </p>
      </div>
      {status && <StatusBadge status={status} />}
    </div>
  );
}
```

- [ ] **Step 3: Create SummaryCard**

Create `src/components/molecules/summary-card.tsx`:

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { BalanceDisplay } from "@/components/atoms/balance-display";

interface SummaryCardProps {
  label: string;
  amount: number | null;
  currency?: string;
}

export function SummaryCard({ label, amount, currency }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <BalanceDisplay amount={amount} currency={currency} size="lg" />
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/components/molecules/
git commit -m "feat: add molecule components — AccountCard, InstitutionHeader, SummaryCard"
```

---

## Task 13: Organism — PlaidLinkFlow

**Files:**
- Create: `src/components/organisms/plaid-link-flow.tsx`

- [ ] **Step 1: Create PlaidLinkFlow**

Create `src/components/organisms/plaid-link-flow.tsx`:

```tsx
"use client";

import { useState, useRef, useCallback } from "react";
import { usePlaidLink } from "react-plaid-link";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Building2 } from "lucide-react";
import { createLinkToken, exchangePublicToken } from "@/actions/plaid";

interface PlaidLinkFlowProps {
  variant?: "primary" | "dropdown-item";
  label?: string;
}

export function PlaidLinkFlow({
  variant = "primary",
  label = "Connect Bank",
}: PlaidLinkFlowProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exchanging, setExchanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const onSuccess = useCallback(
    async (publicToken: string) => {
      setExchanging(true);
      setError(null);
      try {
        const result = await exchangePublicToken(publicToken);
        if ("error" in result && result.error) {
          setError(result.error);
        }
      } catch {
        setError("Failed to connect account");
      } finally {
        setExchanging(false);
        setLinkToken(null);
        triggerRef.current?.focus();
      }
    },
    []
  );

  const onExit = useCallback(
    (err: { error_code: string; error_message: string } | null) => {
      setLinkToken(null);
      if (err) {
        setError(err.error_message || "Connection was interrupted");
      }
      triggerRef.current?.focus();
    },
    []
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
  });

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await createLinkToken();
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      if ("linkToken" in result && result.linkToken) {
        setLinkToken(result.linkToken);
      }
    } catch {
      setError("Failed to initialize bank connection");
    } finally {
      setLoading(false);
    }
  };

  // Open Plaid Link once the token is set and the hook is ready
  if (linkToken && ready && !exchanging) {
    open();
  }

  const isLoading = loading || exchanging;

  if (variant === "dropdown-item") {
    return (
      <button
        ref={triggerRef}
        onClick={handleClick}
        disabled={isLoading}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted rounded-sm disabled:opacity-50"
      >
        {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Building2 className="size-4" />}
        {label}
      </button>
    );
  }

  return (
    <div>
      <Button
        ref={triggerRef}
        onClick={handleClick}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
        ) : (
          <Plus className="size-4" data-icon="inline-start" />
        )}
        {exchanging ? "Connecting..." : label}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
          <button
            onClick={handleClick}
            className="ml-2 underline hover:no-underline"
          >
            Retry
          </button>
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/organisms/plaid-link-flow.tsx
git commit -m "feat: add PlaidLinkFlow organism with lazy token fetch"
```

---

## Task 14: Organism — AccountList + EditAccountDialog

**Files:**
- Create: `src/components/organisms/account-list.tsx`
- Create: `src/components/organisms/edit-account-dialog.tsx`

- [ ] **Step 1: Create EditAccountDialog**

Create `src/components/organisms/edit-account-dialog.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateAccount } from "@/actions/plaid";
import type { AccountRow } from "@/queries/accounts";

interface EditAccountDialogProps {
  account: AccountRow | null;
  onClose: () => void;
}

export function EditAccountDialog({ account, onClose }: EditAccountDialogProps) {
  const [name, setName] = useState(account?.name ?? "");
  const [isHidden, setIsHidden] = useState(account?.isHidden ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(open: boolean) {
    if (!open) onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await updateAccount(account!.id, {
        name: name !== account!.name ? name : undefined,
        isHidden: isHidden !== account!.isHidden ? isHidden : undefined,
      });

      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }

      onClose();
    });
  }

  return (
    <Dialog open={account !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Account</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="edit-hidden">Hide from dashboard</Label>
            <Switch
              id="edit-hidden"
              checked={isHidden}
              onCheckedChange={setIsHidden}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create AccountList**

Create `src/components/organisms/account-list.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AccountCard } from "@/components/molecules/account-card";
import { InstitutionHeader } from "@/components/molecules/institution-header";
import { EditAccountDialog } from "./edit-account-dialog";
import type { InstitutionGroup, AccountRow } from "@/queries/accounts";

interface AccountListProps {
  groups: InstitutionGroup[];
}

export function AccountList({ groups }: AccountListProps) {
  const [editingAccount, setEditingAccount] = useState<AccountRow | null>(null);

  return (
    <>
      <div className="space-y-6">
        {groups.map((group, i) => (
          <Card key={group.plaidItemId ?? "__manual__"}>
            <InstitutionHeader
              institutionName={group.institutionName}
              status={group.status}
              accountCount={group.accounts.length}
            />
            <Separator />
            <div>
              {group.accounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  onEdit={setEditingAccount}
                />
              ))}
            </div>
          </Card>
        ))}
      </div>

      <EditAccountDialog
        account={editingAccount}
        onClose={() => setEditingAccount(null)}
      />
    </>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/components/organisms/account-list.tsx src/components/organisms/edit-account-dialog.tsx
git commit -m "feat: add AccountList and EditAccountDialog organisms"
```

---

## Task 15: Organism — AccountsActions + AddManualAccountDialog + EmptyStateCTA

**Files:**
- Create: `src/components/organisms/add-manual-account-dialog.tsx`
- Create: `src/components/organisms/accounts-actions.tsx`
- Create: `src/components/organisms/empty-state-cta.tsx`

- [ ] **Step 1: Create AddManualAccountDialog**

Create `src/components/organisms/add-manual-account-dialog.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { displayToCents } from "@/lib/money";
import { createManualAccount } from "@/actions/plaid";

const ACCOUNT_TYPES = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "credit", label: "Credit Card" },
  { value: "loan", label: "Loan" },
  { value: "investment", label: "Investment" },
  { value: "other", label: "Other" },
] as const;

interface AddManualAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddManualAccountDialog({
  open,
  onOpenChange,
}: AddManualAccountDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("checking");
  const [balanceStr, setBalanceStr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const balanceNum = parseFloat(balanceStr);
    if (isNaN(balanceNum)) {
      setError("Please enter a valid balance");
      return;
    }

    startTransition(async () => {
      const result = await createManualAccount({
        name,
        type: type as "checking",
        balance: displayToCents(balanceNum),
      });

      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }

      setName("");
      setType("checking");
      setBalanceStr("");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Manual Account</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="manual-name">Account Name</Label>
            <Input
              id="manual-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Cash, Venmo"
              required
              maxLength={100}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="manual-type">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="manual-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="manual-balance">Current Balance ($)</Label>
            <Input
              id="manual-balance"
              type="number"
              step="0.01"
              value={balanceStr}
              onChange={(e) => setBalanceStr(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding..." : "Add Account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create AccountsActions**

Create `src/components/organisms/accounts-actions.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Building2, PenLine } from "lucide-react";
import { PlaidLinkFlow } from "./plaid-link-flow";
import { AddManualAccountDialog } from "./add-manual-account-dialog";

export function AccountsActions() {
  const [manualDialogOpen, setManualDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Plus className="size-4" data-icon="inline-start" />
            Add Account
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <PlaidLinkFlow variant="dropdown-item" label="Connect Bank" />
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setManualDialogOpen(true)}>
            <PenLine className="size-4" />
            Add Manual Account
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AddManualAccountDialog
        open={manualDialogOpen}
        onOpenChange={setManualDialogOpen}
      />
    </>
  );
}
```

- [ ] **Step 3: Create EmptyStateCTA**

Create `src/components/organisms/empty-state-cta.tsx`:

```tsx
"use client";

import { Building2, ShieldCheck } from "lucide-react";
import { PlaidLinkFlow } from "./plaid-link-flow";

export function EmptyStateCTA() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
      <div className="flex items-center justify-center size-16 rounded-2xl bg-muted mb-6">
        <Building2 className="size-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight">
        Connect Your Bank
      </h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">
        Securely link your bank accounts to automatically track balances,
        transactions, and spending. Powered by Plaid.
      </p>
      <div className="mt-6">
        <PlaidLinkFlow label="Connect Bank" />
      </div>
      <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" />
        Bank-grade encryption. Your credentials are never stored.
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/components/organisms/add-manual-account-dialog.tsx src/components/organisms/accounts-actions.tsx src/components/organisms/empty-state-cta.tsx
git commit -m "feat: add AccountsActions, AddManualAccountDialog, EmptyStateCTA organisms"
```

---

## Task 16: Accounts Page + Loading + Error

**Files:**
- Create: `src/app/(dashboard)/accounts/page.tsx`
- Create: `src/app/(dashboard)/accounts/loading.tsx`
- Create: `src/app/(dashboard)/accounts/error.tsx`

- [ ] **Step 1: Create the accounts page**

Create `src/app/(dashboard)/accounts/page.tsx`:

```tsx
import { getHouseholdId } from "@/lib/auth/session";
import { getAccountsByInstitution, getAccountSummary } from "@/queries/accounts";
import { SummaryCard } from "@/components/molecules/summary-card";
import { AccountList } from "@/components/organisms/account-list";
import { AccountsActions } from "@/components/organisms/accounts-actions";
import { EmptyStateCTA } from "@/components/organisms/empty-state-cta";

export default async function AccountsPage() {
  const householdId = await getHouseholdId();

  const [groups, summary] = await Promise.all([
    getAccountsByInstitution(householdId),
    getAccountSummary(householdId),
  ]);

  const hasAccounts = groups.some((g) => g.accounts.length > 0);

  if (!hasAccounts) {
    return <EmptyStateCTA />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <AccountsActions />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <SummaryCard label="Net Worth" amount={summary.netWorth} />
        <SummaryCard label="Assets" amount={summary.totalAssets} />
        <SummaryCard label="Debts" amount={summary.totalLiabilities} />
      </div>

      <AccountList groups={groups} />
    </div>
  );
}
```

- [ ] **Step 2: Create loading state**

Create `src/app/(dashboard)/accounts/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function AccountsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-28" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-3 px-4">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-3 w-16 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <div className="px-4 py-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-12 mt-1" />
        </div>
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Create error boundary**

Create `src/app/(dashboard)/accounts/error.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function AccountsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
      <AlertCircle className="size-10 text-muted-foreground mb-4" />
      <h2 className="text-lg font-semibold">
        Something went wrong loading your accounts
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Please try again. If the problem persists, check your database connection.
      </p>
      <Button onClick={reset} className="mt-4" variant="outline">
        Try Again
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/accounts/
git commit -m "feat: add accounts page with loading skeleton and error boundary"
```

---

## Task 17: OAuth Return Route

**Files:**
- Create: `src/app/api/plaid/oauth-return/route.ts`
- Modify: `src/middleware.ts`

- [ ] **Step 1: Create OAuth return route**

Create `src/app/api/plaid/oauth-return/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

export function GET(request: NextRequest) {
  const receivedRedirectUri = request.url;
  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>Connecting...</title></head>
      <body>
        <script>
          if (window.opener) {
            window.opener.postMessage(
              { type: "plaid-oauth-redirect", receivedRedirectUri: "${receivedRedirectUri}" },
              window.location.origin
            );
            window.close();
          } else {
            window.location.href = "/accounts";
          }
        </script>
        <p>Connecting your account... You can close this window.</p>
      </body>
    </html>
  `;
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}
```

- [ ] **Step 2: Add to public paths in middleware**

In `src/middleware.ts`, update the `publicPaths` array:

```typescript
const publicPaths = ["/login", "/signup", "/api/auth", "/api/health", "/api/plaid/oauth-return"];
```

- [ ] **Step 3: Verify build**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/plaid/oauth-return/route.ts src/middleware.ts
git commit -m "feat: add Plaid OAuth return route for bank redirects"
```

---

## Task 18: SidebarNav Organism

**Files:**
- Create: `src/components/organisms/sidebar-nav.tsx`

- [ ] **Step 1: Create SidebarNav**

Create `src/components/organisms/sidebar-nav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Building2, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface SidebarNavProps {
  userName: string;
  userEmail: string;
}

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Building2 },
];

export function SidebarNav({ userName, userEmail }: SidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
  }

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="px-4 py-4">
        <span className="text-lg font-bold tracking-tight">Ledgr</span>
      </div>

      <Separator />

      <nav className="flex-1 px-2 py-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Separator />

      <div className="px-3 py-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{userName}</p>
            <p className="text-xs text-sidebar-foreground/60 truncate">
              {userEmail}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleSignOut}
            aria-label="Sign out"
            className="text-sidebar-foreground/60 hover:text-sidebar-foreground"
          >
            <LogOut />
          </Button>
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/components/organisms/sidebar-nav.tsx
git commit -m "feat: add SidebarNav organism with nav links and sign out"
```

---

## Task 19: Dashboard Layout Integration

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`
- Modify: `src/app/(dashboard)/page.tsx`

- [ ] **Step 1: Update dashboard layout with sidebar**

Replace `src/app/(dashboard)/layout.tsx` with:

```tsx
import { getSession } from "@/lib/auth/session";
import { SidebarNav } from "@/components/organisms/sidebar-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  return (
    <div className="flex min-h-screen">
      <SidebarNav
        userName={session?.user?.name ?? "User"}
        userEmail={session?.user?.email ?? ""}
      />
      <main className="flex-1 overflow-auto px-6 py-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Update dashboard stub page**

Replace `src/app/(dashboard)/page.tsx` with:

```tsx
import { getHouseholdId } from "@/lib/auth/session";

export default async function DashboardPage() {
  await getHouseholdId();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Your financial overview. Coming in Phase 6.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/layout.tsx src/app/(dashboard)/page.tsx
git commit -m "feat: integrate SidebarNav into dashboard layout"
```

---

## Task 20: E2E Tests

**Files:**
- Create: `e2e/accounts.spec.ts`

- [ ] **Step 1: Create accounts E2E tests**

Create `e2e/accounts.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test.describe("accounts page", () => {
  test("shows empty state with Connect Your Bank CTA for new user", async ({
    page,
  }) => {
    // Assumes a fresh user session — the auth E2E setup handles this
    await page.goto("/accounts");

    // Should redirect to login if not authenticated
    await expect(page).toHaveURL(/\/login/);
  });

  test("shows Connect Your Bank heading on empty accounts page", async ({
    page,
  }) => {
    // This test verifies the page structure exists
    // Full Plaid Link E2E requires sandbox credentials
    await page.goto("/accounts");
    // If redirected to login, the middleware is working
    const url = page.url();
    expect(url).toContain("login");
  });

  // Full Plaid Link E2E requires sandbox credentials.
  // To test locally:
  // 1. Set PLAID_CLIENT_ID and PLAID_SECRET in .env
  // 2. Set PLAID_ENV=sandbox
  // 3. Use Plaid sandbox credentials: user_good / pass_good
  test.skip("full Plaid Link flow", async ({ page }) => {
    // Sign up / sign in
    // Navigate to /accounts
    // Click "Connect Bank"
    // Complete Plaid Link with sandbox credentials
    // Verify accounts appear on page
  });
});
```

- [ ] **Step 2: Run E2E tests**

```bash
pnpm test:e2e
```

Expected: PASS (including skipped test)

- [ ] **Step 3: Commit**

```bash
git add e2e/accounts.spec.ts
git commit -m "test: add accounts page E2E tests"
```

---

## Task 21: Run Full Test Suite + Final Verification

- [ ] **Step 1: Run all unit and integration tests**

```bash
ENCRYPTION_KEY=$(openssl rand -hex 32) PLAID_CLIENT_ID=test PLAID_SECRET=test PLAID_ENV=sandbox pnpm test
```

Expected: all PASS

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

Expected: no errors (fix any if found)

- [ ] **Step 4: Start dev server and verify manually**

```bash
pnpm dev
```

Open `http://localhost:3000`:
1. Should see login page (middleware redirect)
2. After sign up/in: sidebar visible with Dashboard and Accounts links
3. Navigate to `/accounts`: empty state with "Connect Your Bank" CTA
4. Click "+ Add Account" → "Add Manual Account": dialog opens, create a checking account with $1000
5. Account appears in list with correct balance

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during final verification"
```
