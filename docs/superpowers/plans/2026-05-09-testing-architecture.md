# Testing Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install and configure Vitest, fast-check, Playwright, Stryker, and MSW. Write the first round of unit, property-based, and integration tests for the existing `lib/` and `db/` code.

**Architecture:** Colocated unit tests (`*.test.ts` next to source), separate `tests/integration/` for DB tests, separate `e2e/` for Playwright. Test DB factory provides in-memory SQLite per test file. Property-based tests via fast-check prove financial math invariants.

**Tech Stack:** Vitest, @fast-check/vitest, Playwright, @stryker-mutator/core, MSW, vite-tsconfig-paths

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `vitest.config.ts` | Vitest configuration with path aliases |
| Create | `playwright.config.ts` | Playwright E2E config |
| Create | `stryker.config.json` | Mutation testing config |
| Create | `tests/integration/setup.ts` | In-memory SQLite test DB factory |
| Create | `src/lib/money.test.ts` | Unit + property-based tests for money utilities |
| Create | `src/lib/encryption.test.ts` | Unit tests for encrypt/decrypt round-trip |
| Create | `tests/integration/scoped-query.test.ts` | Integration test: household data isolation |
| Create | `tests/mocks/handlers.ts` | MSW handlers for Plaid API |
| Create | `tests/mocks/server.ts` | MSW server setup for Vitest |
| Create | `e2e/health.spec.ts` | Playwright: health check endpoint |
| Modify | `package.json` | Add test scripts and dev dependencies |
| Modify | `src/lib/scoped-query.ts` | Accept db as parameter for testability |

---

### Task 1: Install Test Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Vitest and related packages**

```bash
pnpm add -D vitest vite-tsconfig-paths @fast-check/vitest @vitest/coverage-v8
```

- [ ] **Step 2: Install Playwright**

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

- [ ] **Step 3: Install Stryker**

```bash
pnpm add -D @stryker-mutator/core @stryker-mutator/vitest-runner @stryker-mutator/typescript-checker
```

- [ ] **Step 4: Install MSW**

```bash
pnpm add -D msw
```

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add test dependencies (vitest, fast-check, playwright, stryker, msw)"
```

---

### Task 2: Vitest Configuration

**Files:**
- Create: `vitest.config.ts`

- [ ] **Step 1: Create vitest.config.ts**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/lib/**", "src/actions/**", "src/queries/**"],
      exclude: ["**/*.test.ts", "src/db/schema/**"],
    },
  },
});
```

- [ ] **Step 2: Verify Vitest runs (no tests yet, should exit cleanly)**

```bash
pnpm vitest run
```

Expected: "No test files found" or exits with 0.

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "chore: add vitest configuration with path aliases and v8 coverage"
```

---

### Task 3: Add Test Scripts to package.json

**Files:**
- Modify: `package.json` (scripts section)

- [ ] **Step 1: Add all test scripts to package.json**

Add these scripts to the `"scripts"` object in `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage",
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui",
"test:mutate": "stryker run",
"test:mutate:incremental": "stryker run --incremental"
```

- [ ] **Step 2: Verify test script works**

```bash
pnpm test
```

Expected: exits cleanly (no test files yet).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add test scripts (test, coverage, e2e, mutate)"
```

---

### Task 4: Property-Based Tests for money.ts

**Files:**
- Create: `src/lib/money.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// src/lib/money.test.ts
import { describe, it, expect } from "vitest";
import { fc } from "@fast-check/vitest";
import {
  centsToDisplay,
  displayToCents,
  plaidAmountToCents,
  normalizeAmount,
} from "./money";

describe("money utilities", () => {
  describe("centsToDisplay", () => {
    it("formats positive cents as USD", () => {
      expect(centsToDisplay(1250)).toBe("$12.50");
    });

    it("formats zero", () => {
      expect(centsToDisplay(0)).toBe("$0.00");
    });

    it("formats negative cents", () => {
      expect(centsToDisplay(-1250)).toBe("-$12.50");
    });

    it("formats large amounts with comma separators", () => {
      expect(centsToDisplay(1000000)).toBe("$10,000.00");
    });
  });

  describe("displayToCents", () => {
    it("converts dollars to cents", () => {
      expect(displayToCents(12.5)).toBe(1250);
    });

    it("handles zero", () => {
      expect(displayToCents(0)).toBe(0);
    });

    it("rounds fractional cents", () => {
      expect(displayToCents(12.555)).toBe(1256);
    });
  });

  describe("plaidAmountToCents", () => {
    it("converts Plaid dollar amount to integer cents", () => {
      expect(plaidAmountToCents(12.5)).toBe(1250);
    });

    it("handles negative amounts (credits)", () => {
      expect(plaidAmountToCents(-50.0)).toBe(-5000);
    });
  });

  describe("normalizeAmount", () => {
    it("flips positive to negative (expense)", () => {
      expect(normalizeAmount(1250)).toBe(-1250);
    });

    it("flips negative to positive (income)", () => {
      expect(normalizeAmount(-1250)).toBe(1250);
    });

    it("handles zero", () => {
      expect(normalizeAmount(0)).toBe(0);
    });
  });
});

describe("money property-based tests", () => {
  fc.test(
    "normalizeAmount is its own inverse",
    [fc.integer({ min: -100_000_000, max: 100_000_000 })],
    (amount) => {
      expect(normalizeAmount(normalizeAmount(amount))).toBe(amount);
    }
  );

  fc.test(
    "plaidAmountToCents always returns an integer",
    [fc.double({ min: -999999.99, max: 999999.99, noNaN: true, noDefaultInfinity: true })],
    (amount) => {
      expect(Number.isInteger(plaidAmountToCents(amount))).toBe(true);
    }
  );

  fc.test(
    "displayToCents always returns an integer",
    [fc.double({ min: -999999.99, max: 999999.99, noNaN: true, noDefaultInfinity: true })],
    (amount) => {
      expect(Number.isInteger(displayToCents(amount))).toBe(true);
    }
  );

  fc.test(
    "normalizeAmount of positive is negative (sign convention)",
    [fc.integer({ min: 1, max: 100_000_000 })],
    (amount) => {
      expect(normalizeAmount(amount)).toBeLessThan(0);
    }
  );

  fc.test(
    "normalizeAmount of negative is positive (sign convention)",
    [fc.integer({ min: -100_000_000, max: -1 })],
    (amount) => {
      expect(normalizeAmount(amount)).toBeGreaterThan(0);
    }
  );
});
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
pnpm test src/lib/money.test.ts
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/money.test.ts
git commit -m "test: add unit + property-based tests for money utilities"
```

---

### Task 5: Unit Tests for encryption.ts

**Files:**
- Create: `src/lib/encryption.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// src/lib/encryption.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";
import { encrypt, decrypt } from "./encryption";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

describe("encryption", () => {
  it("round-trips a simple string", () => {
    const plaintext = "access-sandbox-abc123";
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("produces different ciphertext for same plaintext (random IV)", () => {
    const plaintext = "same-input";
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(plaintext);
    expect(decrypt(b)).toBe(plaintext);
  });

  it("handles empty string", () => {
    const encrypted = encrypt("");
    expect(decrypt(encrypted)).toBe("");
  });

  it("handles unicode characters", () => {
    const plaintext = "こんにちは世界 🔐";
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("handles long strings", () => {
    const plaintext = "a".repeat(10000);
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("fails to decrypt with wrong key", () => {
    const plaintext = "secret-token";
    const encrypted = encrypt(plaintext);

    const originalKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("hex");

    expect(() => decrypt(encrypted)).toThrow();

    process.env.ENCRYPTION_KEY = originalKey;
  });

  it("fails to decrypt tampered ciphertext", () => {
    const encrypted = encrypt("test-data");
    const buf = Buffer.from(encrypted, "base64");
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString("base64");

    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws when ENCRYPTION_KEY is missing", () => {
    const originalKey = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;

    expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY environment variable is required");

    process.env.ENCRYPTION_KEY = originalKey;
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
pnpm test src/lib/encryption.test.ts
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/encryption.test.ts
git commit -m "test: add unit tests for encryption round-trip and tamper detection"
```

---

### Task 6: Test DB Factory + Generate Initial Migration

**Files:**
- Create: `tests/integration/setup.ts`

The integration tests need Drizzle migrations to exist. We must generate them first, then the test factory can apply them to in-memory SQLite.

- [ ] **Step 1: Generate Drizzle migrations from schema**

```bash
pnpm db:generate
```

Expected: migration files created in `src/db/migrations/`.

- [ ] **Step 2: Create the test DB factory**

```typescript
// tests/integration/setup.ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../../src/db/schema";

export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./src/db/migrations" });
  return { db, close: () => sqlite.close() };
}
```

- [ ] **Step 3: Verify the factory works with a quick smoke test**

Create a temporary test to verify the DB factory works:

```typescript
// tests/integration/db-factory.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "./setup";
import { households } from "../../src/db/schema";

describe("createTestDb", () => {
  let close: () => void;

  afterEach(() => {
    close?.();
  });

  it("creates a working in-memory database with schema", () => {
    const testDb = createTestDb();
    close = testDb.close;

    testDb.db.insert(households).values({
      id: "hh-1",
      name: "Test Household",
    }).run();

    const result = testDb.db.select().from(households).all();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Test Household");
  });

  it("provides isolated instances (no shared state)", () => {
    const db1 = createTestDb();
    const db2 = createTestDb();

    db1.db.insert(households).values({ id: "hh-1", name: "Household A" }).run();

    const result = db2.db.select().from(households).all();
    expect(result).toHaveLength(0);

    db1.close();
    db2.close();
  });
});
```

- [ ] **Step 4: Run the smoke test**

```bash
pnpm test tests/integration/db-factory.test.ts
```

Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/setup.ts tests/integration/db-factory.test.ts src/db/migrations/
git commit -m "test: add in-memory SQLite test DB factory with smoke tests"
```

---

### Task 7: Make scoped-query Testable + Integration Tests

**Files:**
- Modify: `src/lib/scoped-query.ts`
- Create: `tests/integration/scoped-query.test.ts`

The current `scoped-query.ts` imports `db` directly from `@/db`, making it impossible to pass a test DB. Refactor to accept `db` as a parameter.

- [ ] **Step 1: Refactor scoped-query.ts to accept db parameter**

Replace the contents of `src/lib/scoped-query.ts` with:

```typescript
// src/lib/scoped-query.ts
import { eq, and, type SQL } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as defaultDb } from "@/db";
import type * as schema from "@/db/schema";

type LedgrDb = BetterSQLite3Database<typeof schema>;

export function scopedQuery(householdId: string, db: LedgrDb = defaultDb) {
  return {
    db,
    householdId,
    where<T extends { householdId: { name: string } }>(
      table: T,
      ...conditions: (SQL | undefined)[]
    ) {
      const filtered = conditions.filter((c): c is SQL => c !== undefined);
      return filtered.length > 0
        ? and(eq(table.householdId, householdId), ...filtered)
        : eq(table.householdId, householdId);
    },
  };
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Write the scoped-query integration test**

```typescript
// tests/integration/scoped-query.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./setup";
import { scopedQuery } from "../../src/lib/scoped-query";
import {
  households,
  accounts,
  transactions,
  categoryGroups,
  categories,
} from "../../src/db/schema";

describe("scopedQuery - household data isolation", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let close: () => void;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    close = testDb.close;

    // Seed two households
    db.insert(households).values([
      { id: "hh-a", name: "Household A" },
      { id: "hh-b", name: "Household B" },
    ]).run();

    // Seed accounts for each household
    db.insert(accounts).values([
      {
        id: "acc-a1",
        householdId: "hh-a",
        name: "Checking A",
        type: "checking",
      },
      {
        id: "acc-b1",
        householdId: "hh-b",
        name: "Checking B",
        type: "checking",
      },
    ]).run();

    // Seed category groups and categories for transactions
    db.insert(categoryGroups).values([
      { id: "cg-a", householdId: "hh-a", name: "Expenses A" },
      { id: "cg-b", householdId: "hh-b", name: "Expenses B" },
    ]).run();

    db.insert(categories).values([
      { id: "cat-a", householdId: "hh-a", groupId: "cg-a", name: "Food A" },
      { id: "cat-b", householdId: "hh-b", groupId: "cg-b", name: "Food B" },
    ]).run();

    // Seed transactions
    db.insert(transactions).values([
      {
        id: "txn-a1",
        accountId: "acc-a1",
        householdId: "hh-a",
        date: "2026-01-15",
        originalName: "Grocery Store",
        name: "Grocery Store",
        amount: 5000,
        normalizedAmount: -5000,
      },
      {
        id: "txn-b1",
        accountId: "acc-b1",
        householdId: "hh-b",
        date: "2026-01-15",
        originalName: "Restaurant",
        name: "Restaurant",
        amount: 3000,
        normalizedAmount: -3000,
      },
    ]).run();
  });

  afterEach(() => {
    close();
  });

  it("where() filters to only the specified household", () => {
    const scoped = scopedQuery("hh-a", db);
    const result = db
      .select()
      .from(accounts)
      .where(scoped.where(accounts))
      .all();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Checking A");
  });

  it("household A cannot see household B transactions", () => {
    const scoped = scopedQuery("hh-a", db);
    const result = db
      .select()
      .from(transactions)
      .where(scoped.where(transactions))
      .all();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("txn-a1");
    expect(result.every((t) => t.householdId === "hh-a")).toBe(true);
  });

  it("household B cannot see household A transactions", () => {
    const scoped = scopedQuery("hh-b", db);
    const result = db
      .select()
      .from(transactions)
      .where(scoped.where(transactions))
      .all();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("txn-b1");
    expect(result.every((t) => t.householdId === "hh-b")).toBe(true);
  });

  it("where() combines with additional conditions", () => {
    // Add a second transaction for household A
    db.insert(transactions).values({
      id: "txn-a2",
      accountId: "acc-a1",
      householdId: "hh-a",
      date: "2026-01-20",
      originalName: "Coffee Shop",
      name: "Coffee Shop",
      amount: 500,
      normalizedAmount: -500,
    }).run();

    const scoped = scopedQuery("hh-a", db);
    const result = db
      .select()
      .from(transactions)
      .where(scoped.where(transactions, eq(transactions.id, "txn-a2")))
      .all();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Coffee Shop");
  });

  it("non-existent household returns empty results", () => {
    const scoped = scopedQuery("hh-nonexistent", db);
    const result = db
      .select()
      .from(transactions)
      .where(scoped.where(transactions))
      .all();

    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run the integration test**

```bash
pnpm test tests/integration/scoped-query.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scoped-query.ts tests/integration/scoped-query.test.ts
git commit -m "test: add scoped-query integration tests proving household isolation"
```

---

### Task 8: MSW Mock Handlers

**Files:**
- Create: `tests/mocks/handlers.ts`
- Create: `tests/mocks/server.ts`

- [ ] **Step 1: Create Plaid API mock handlers**

```typescript
// tests/mocks/handlers.ts
import { http, HttpResponse } from "msw";

export const plaidHandlers = [
  http.post("https://sandbox.plaid.com/link/token/create", () =>
    HttpResponse.json({
      link_token: "link-sandbox-test-token",
      expiration: "2026-12-31T00:00:00Z",
      request_id: "req-test-123",
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
          account_id: "plaid-acc-1",
          name: "Plaid Checking",
          official_name: "Plaid Gold Standard Checking",
          type: "depository",
          subtype: "checking",
          balances: {
            current: 1000.0,
            available: 900.0,
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

- [ ] **Step 2: Create MSW server setup for Vitest**

```typescript
// tests/mocks/server.ts
import { setupServer } from "msw/node";
import { allHandlers } from "./handlers";

export const server = setupServer(...allHandlers);
```

- [ ] **Step 3: Commit**

```bash
git add tests/mocks/handlers.ts tests/mocks/server.ts
git commit -m "test: add MSW mock handlers for Plaid API"
```

---

### Task 9: Playwright Configuration + Health Check E2E

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/health.spec.ts`

- [ ] **Step 1: Create playwright.config.ts**

```typescript
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: "html",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 2: Create health check E2E test**

```typescript
// e2e/health.spec.ts
import { test, expect } from "@playwright/test";

test("GET /api/health returns ok", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);

  const body = await response.json();
  expect(body.status).toBe("ok");
  expect(body.version).toBe("0.1.0");
  expect(body.db).toBe("connected");
});
```

- [ ] **Step 3: Commit**

```bash
git add playwright.config.ts e2e/health.spec.ts
git commit -m "test: add playwright config and health check e2e test"
```

---

### Task 10: Stryker Configuration

**Files:**
- Create: `stryker.config.json`

- [ ] **Step 1: Create stryker.config.json**

```json
{
  "$schema": "https://raw.githubusercontent.com/stryker-mutator/stryker/master/packages/core/schema/stryker-core.schema.json",
  "mutate": [
    "src/lib/**/*.ts",
    "!src/lib/**/*.test.ts",
    "src/actions/**/*.ts",
    "!src/actions/**/*.test.ts",
    "src/queries/**/*.ts",
    "!src/queries/**/*.test.ts"
  ],
  "testRunner": "vitest",
  "checkers": ["typescript"],
  "tsconfigFile": "tsconfig.json",
  "coverageAnalysis": "perTest",
  "thresholds": {
    "high": 80,
    "low": 60,
    "break": 60
  },
  "reporters": ["html", "clear-text", "progress"],
  "htmlReporter": {
    "fileName": "reports/mutation/mutation.html"
  },
  "incremental": true,
  "incrementalFile": "reports/mutation/.stryker-incremental.json"
}
```

- [ ] **Step 2: Add reports/ to .gitignore**

Append to `.gitignore`:

```
# Test reports
reports/
playwright-report/
test-results/
.stryker-tmp/
```

- [ ] **Step 3: Commit**

```bash
git add stryker.config.json .gitignore
git commit -m "chore: add stryker mutation testing config"
```

---

### Task 11: Run Full Test Suite and Verify

- [ ] **Step 1: Run all unit + integration tests**

```bash
pnpm test
```

Expected: all tests PASS (money, encryption, db-factory, scoped-query).

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Run mutation testing on money.ts**

```bash
pnpm test:mutate -- --mutate "src/lib/money.ts"
```

Expected: mutation score reported. Review survived mutants — they indicate test gaps. Score should be >80% given the property-based tests.

- [ ] **Step 4: Run lint**

```bash
pnpm lint
```

Expected: passes or only minor warnings.

- [ ] **Step 5: Final commit if any cleanup was needed**

```bash
git add -A
git commit -m "test: verify full test suite passes with mutation testing"
```
