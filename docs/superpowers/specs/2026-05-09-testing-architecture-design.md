# Ledgr — Testing Architecture Design

A testing architecture designed for AI-agent-driven development. Every layer exists to catch a specific failure mode that AI coding agents introduce. Built on staff engineer research and real production incident analysis from 2025-2026.

## Stack

| Tool | Version | Purpose |
|------|---------|---------|
| Vitest | latest | Unit + integration tests |
| fast-check | latest (@fast-check/vitest) | Property-based tests for financial math |
| Playwright | latest | E2E critical journeys |
| Stryker | latest (@stryker-mutator/core) | Mutation testing gate |
| MSW | latest | Mock external APIs (Plaid, AI providers) |

## File Organization

```
src/
├── lib/
│   ├── money.ts
│   ├── money.test.ts              # unit + property-based (colocated)
│   ├── encryption.ts
│   ├── encryption.test.ts
│   ├── scoped-query.ts
│   └── scoped-query.test.ts
├── db/
│   └── schema/                    # no tests (declarative schemas)
├── actions/
│   └── *.test.ts                  # integration tests (real SQLite)
├── queries/
│   └── *.test.ts                  # integration tests (real SQLite)
tests/
├── integration/
│   ├── setup.ts                   # in-memory SQLite test DB factory
│   └── db.test.ts                 # Drizzle query tests against real DB
e2e/
├── auth.spec.ts                   # Playwright critical journeys
├── transactions.spec.ts
└── fixtures/                      # test data factories
vitest.config.ts
playwright.config.ts
stryker.config.json
```

**Principles:**
- Colocate unit tests with source files (`money.test.ts` next to `money.ts`).
- Separate integration tests (need DB) and E2E tests (need browser) into their own directories.
- No tests for declarative code (schemas, configs, type definitions).

## Testing Layers

| Layer | Tool | What It Tests | AI Failure Mode It Catches |
|-------|------|--------------|---------------------------|
| Unit + Property | Vitest + fast-check | Pure logic (money, encryption, categorization rules) | Hallucinated math, rounding errors, sign flip bugs |
| Integration | Vitest + real SQLite (in-memory) | Drizzle queries, scoped-query isolation, server actions | Missing WHERE clauses, data leaks between households, FK violations |
| Contract | Zod schemas + Vitest | Plaid API response shapes, CSV parser output | AI assuming wrong API shape, silent data loss on parse |
| Mutation | Stryker (incremental) | Whether tests actually catch bugs | Tautological tests, weak assertions, happy-path-only coverage |
| E2E | Playwright | 5-8 critical user journeys end-to-end | Cross-component integration failures, auth flow breaks |
| Static | TypeScript strict + ESLint | Type safety, hallucinated APIs | Calling methods that don't exist, wrong argument types |

### Test Budget Per Work Type

No test explosions. Classify by work type:

- **Feature:** 3-5 behavioral tests + property tests if financial math involved
- **Bug fix:** 2-3 regression tests proving the fix
- **Refactor:** 0 new tests (existing tests must pass)

### Key Rule

Humans write test expectations (what should happen). AI implements against them. Never let AI write both code and tests in the same session.

## Integration Test DB Strategy

Each integration test gets a fresh in-memory SQLite instance. No shared state, no cleanup, no test ordering issues.

```typescript
// tests/integration/setup.ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/db/schema";

export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./src/db/migrations" });
  return { db, close: () => sqlite.close() };
}
```

**Properties:**
- `:memory:` — zero disk I/O, instant teardown
- `foreign_keys = ON` — matches production behavior (catches FK violations)
- Schema applied via Drizzle migrations — tests run against the same schema as production
- Each test file gets its own DB instance — full isolation

**Scoped-query isolation tests:** Create two households in the same test DB, verify queries for household A never return household B's data. This is the most critical integration test for a multi-tenant app.

## Property-Based Tests for Financial Math

fast-check generates random inputs and auto-shrinks to minimal counterexample on failure. Covers edge cases (0, MAX_SAFE_INTEGER boundary, negatives) that hand-written tests miss.

### Invariants to Prove

1. **Round-trip consistency:** `displayToCents(parse(centsToDisplay(x))) ≈ x` for valid cent values
2. **Normalize is self-inverse:** `normalizeAmount(normalizeAmount(x)) === x`
3. **Integer guarantee:** `plaidAmountToCents` output is always an integer (no floating-point residue)
4. **Split sum invariant:** sum of `transaction_splits.amount` === parent `transaction.amount`
5. **Sign convention:** `normalizeAmount` of positive input is always negative

### Example

```typescript
import { fc } from "@fast-check/vitest";
import { normalizeAmount, plaidAmountToCents } from "./money";

fc.test(
  "normalizeAmount is its own inverse",
  [fc.integer({ min: -100_000_000, max: 100_000_000 })],
  (amount) => {
    expect(normalizeAmount(normalizeAmount(amount))).toBe(amount);
  }
);

fc.test(
  "plaidAmountToCents always returns an integer",
  [fc.double({ min: -999999.99, max: 999999.99, noNaN: true })],
  (amount) => {
    expect(Number.isInteger(plaidAmountToCents(amount))).toBe(true);
  }
);
```

**Why this matters for AI agents:** An AI might "fix" `normalizeAmount` to handle edge cases and accidentally break the sign flip invariant. Property tests catch this instantly across 1000 random inputs.

## Mutation Testing Gate

Stryker introduces small bugs (mutants) into code — flips `>` to `>=`, changes `+` to `-`, removes `return` statements — and checks if tests catch them. Survived mutants = gaps in test suite.

### Configuration

```json
{
  "mutate": [
    "src/lib/**/*.ts",
    "src/actions/**/*.ts",
    "src/queries/**/*.ts"
  ],
  "ignorePatterns": ["**/*.test.ts", "**/*.spec.ts"],
  "testRunner": "vitest",
  "checkers": ["typescript"],
  "coverageAnalysis": "perTest",
  "thresholds": { "high": 80, "low": 60, "break": 60 }
}
```

### Scope

Only business logic: `src/lib/`, `src/actions/`, `src/queries/`. Not UI components, not schemas, not configs.

### Run Strategy

- **PR gate:** Incremental mode (only mutate changed files). Warns below 80%, blocks merge below 60%.
- **Nightly:** Full mutation run across all scoped files.
- **Thresholds:** 80%+ = pass (green), 60-80% = warning (yellow), <60% = fail/block (red).

### What It Catches That Coverage Doesn't

- AI writes `expect(add(2,2)).toBe(add(2,2))` — 100% coverage, 0% mutation score
- Tests that check `response.status` exists but not that it equals 200
- Tests that assert a function was called but not with the right arguments

### CI Integration

Run as a separate step after `vitest` passes. ~2-3 min for incremental on a PR, ~10-15 min for full nightly.

## E2E with Playwright

Only 5-8 critical journeys. Not comprehensive coverage — integration tests handle that. E2E proves the whole system works together for the paths that matter most.

### Critical Journeys

1. Signup → onboarding → first dashboard view
2. Login → session persistence → logout
3. Connect Plaid account → trigger sync → see transactions
4. CSV import → column mapping → preview → confirm → transactions appear
5. Categorize transaction → verify budget updates
6. Create budget → set category limits → view progress
7. Settings → update profile → change theme
8. Health check endpoint returns OK

### Configuration

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,

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

**Design decisions:**
- Chromium only in CI (multi-browser locally if desired)
- `trace: "on-first-retry"` — only capture debug artifacts on failure
- `webServer.timeout = 120_000` — Next.js cold start needs time
- Retries: 2 in CI, 0 locally
- No Page Object Model yet — add when 3+ specs touch the same page

## Vitest Configuration

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

**Design decisions:**
- `environment: "node"` — server-side code, no DOM needed for unit/integration tests
- `globals: true` — `describe`, `it`, `expect` available without imports
- Path aliases via `vite-tsconfig-paths` — `@/` works in tests
- Coverage scoped to business logic only

## npm Scripts

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui",
  "test:mutate": "stryker run",
  "test:mutate:incremental": "stryker run --incremental"
}
```

## CI Pipeline Order

1. `pnpm typecheck` — TypeScript strict mode (catches hallucinated APIs)
2. `pnpm lint` — ESLint (catches style + logic issues)
3. `pnpm test` — Vitest unit + integration (fast, ~10s)
4. `pnpm test:mutate:incremental` — Stryker on changed files (~2-3 min)
5. `pnpm test:e2e` — Playwright critical journeys (~1-2 min)

Static analysis first (fastest, catches most). Mutation after unit tests pass (validates test quality). E2E last (slowest, most expensive).

## External API Mocking with MSW

Use MSW (Mock Service Worker) to intercept Plaid API and AI provider calls at the network level. Same mocks work in both Vitest and Playwright.

```typescript
// tests/mocks/handlers.ts
import { http, HttpResponse } from "msw";

export const plaidHandlers = [
  http.post("https://sandbox.plaid.com/transactions/sync", () =>
    HttpResponse.json({
      added: [],
      modified: [],
      removed: [],
      has_more: false,
      next_cursor: "cursor_abc",
    })
  ),
];
```

Setup in Vitest via `setupServer` (node interceptor). Setup in Playwright via `page.route` or MSW browser integration.
