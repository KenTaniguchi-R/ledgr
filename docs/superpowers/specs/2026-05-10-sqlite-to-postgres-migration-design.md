# SQLite → PostgreSQL Migration Design

**Date:** 2026-05-10
**Status:** Draft
**Scope:** Clean cut from SQLite to PostgreSQL. No dual-dialect support. Greenfield Postgres — no data migration.
**Motivation:** Future multi-user SaaS requires write concurrency and connection pooling that SQLite cannot provide.

---

## Architecture Overview

Bottom-up migration: Schema → DB Init → Auth → Queries (sync→async) → Actions → Tests → Docker.

The entire query/action layer must convert from synchronous (better-sqlite3) to asynchronous (node-postgres) in one atomic pass — there is no intermediate compilable state.

```
Before:
  better-sqlite3 (sync) → drizzle-orm/better-sqlite3 → SQLite file

After:
  pg Pool (async) → drizzle-orm/node-postgres → PostgreSQL server
```

---

## 1. Schema Layer (13 files)

All files in `src/db/schema/` change from `drizzle-orm/sqlite-core` to `drizzle-orm/pg-core`.

### Type mappings

| SQLite (current) | PostgreSQL (target) |
|-------------------|---------------------|
| `sqliteTable` | `pgTable` |
| `integer("col", { mode: "boolean" })` | `boolean("col")` |
| `integer("col")` (bare, used as boolean e.g. `mcpEnabled`) | `boolean("col")` — fix `=== 1` comparisons |
| `real("quantity")` | `doublePrecision("quantity")` |
| `sql\`(CURRENT_TIMESTAMP)\`` | `timestamp({ withTimezone: true }).defaultNow()` |
| `integer("col", { mode: "timestamp_ms" })` with `unixepoch()` default (auth.ts) | `timestamp({ withTimezone: true }).defaultNow()` |
| `text("id")` (app-generated UUIDs) | `text("id")` — no change |
| `text("date")` (YYYY-MM-DD strings) | `text("date")` — no change (avoids cascading query changes) |

### Key decisions

- **Dates stay as TEXT.** Business date columns (`transactions.date`, `balance_history.date`) remain `text` with `YYYY-MM-DD` ISO strings. This avoids cascading changes in every query that does string slicing. Range queries and sorting work correctly with lexicographic text comparison.
- **Auth timestamps become native.** Better Auth's Postgres adapter expects `timestamp` columns, not integer epoch-ms. The SQLite `unixepoch('subsecond') * 1000` pattern is replaced entirely.
- **All timestamps use `withTimezone: true`.** Ensures UTC storage regardless of Postgres server timezone settings.
- **`mcpEnabled` becomes boolean.** Currently `integer().default(0)` without `{ mode: "boolean" }`. Fix `=== 1` comparison in `queries/settings.ts` to use truthiness.

### New index

Add composite index for cursor pagination performance:
```typescript
// src/db/schema/transactions.ts
idx_txn_household_date_id: index("idx_txn_household_date_id")
  .on(transactions.householdId, transactions.date, transactions.id)
```

---

## 2. DB Init & Driver

### `src/db/index.ts` — full rewrite

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("connect", (client) => {
  client.query("SET statement_timeout = '30s'");
});

export const db = drizzle({ client: pool, schema });
export type LedgrDb = typeof db;
```

- Remove: `better-sqlite3`, all PRAGMAs (WAL, busy_timeout, foreign_keys, synchronous)
- `DATABASE_URL` env var replaces `DATABASE_PATH`
- Postgres enforces foreign keys by default — no pragma needed
- Connection pool configured for multi-user SaaS with explicit limits

### `drizzle.config.ts`

```typescript
export default defineConfig({
  schema: "./src/db/schema",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### `src/lib/scoped-query.ts`

Replace `SQLiteColumn` import with `PgColumn` from `drizzle-orm/pg-core`.

### `src/lib/query-helpers.ts`

Replace `SQLiteColumn` import with `PgColumn` from `drizzle-orm/pg-core`.

### Dependencies

Remove: `better-sqlite3`, `@types/better-sqlite3`
Add: `pg`, `@types/pg`
Remove `better-sqlite3` from `pnpm.onlyBuiltDependencies` in `package.json`.

---

## 3. Auth Config

### `src/lib/auth/index.ts`

- `drizzleAdapter(db, { provider: "sqlite" })` → `drizzleAdapter(db, { provider: "pg" })`

### `src/db/schema/auth.ts`

- All `integer("col", { mode: "timestamp_ms" })` → `timestamp("col", { withTimezone: true })`
- Remove `sql\`(cast(unixepoch('subsecond') * 1000 as integer))\`` defaults → `.defaultNow()`
- `integer` booleans → native `boolean()`

---

## 4. Sync → Async Conversion (Largest Work Item)

### Scope

The `better-sqlite3` Drizzle adapter is synchronous. The `node-postgres` adapter is async — all queries return `Promise`. This affects:

- **All query files** (`src/queries/*.ts`) — ~11 files
- **All action files** (`src/actions/*.ts`) — ~12 files
- **Lib files with DB access** — `spending-helpers.ts`, `scoped-query.ts`, all `plaid/*.ts`, `categorization/*.ts`, `ai/*.ts`, `auth/*.ts`, `jobs/*.ts`, `import/*.ts`
- **All 33 integration test files** — including test helpers
- **Seed scripts** — `src/db/seed/*.ts`

### Conversion pattern

```typescript
// Before (sync)
const rows = db.select().from(table).where(cond).all();
db.insert(table).values(data).run();
const row = db.select().from(table).where(cond).get();

// After (async)
const rows = await db.select().from(table).where(cond);
await db.insert(table).values(data);
const [row] = await db.select().from(table).where(cond).limit(1);
```

### Transaction callbacks

All 7 existing `db.transaction()` sites must change from sync to async:

```typescript
// Before
db.transaction((tx) => { tx.insert(...).run(); });

// After
await db.transaction(async (tx) => { await tx.insert(...); });
```

Affected files:
- `src/actions/accounts.ts` (1 site)
- `src/actions/plaid.ts` (2 sites)
- `src/actions/transaction-detail.ts` (2 sites)
- `src/lib/auth/provision.ts` (1 site)
- `src/lib/categorization/engine.ts` (1 site)

---

## 5. Query Layer Changes

### Raw SQL updates (minimal)

| Location | Change |
|----------|--------|
| `reports.ts` (2 sites) | `substr(date, 1, 7)` → `substring(date from 1 for 7)` |
| `investments.ts` (6 sites) | Replace `inIds()` helper with Drizzle's `inArray()`, preserve empty-array guards |
| `health route` | `db.run(sql\`SELECT 1\`)` → `await db.execute(sql\`SELECT 1\`)` |

Most raw SQL (`COALESCE`, `SUM`, `ABS`, `CASE`, cursor pagination OR-expansion) is standard SQL and requires no changes.

### Architectural cleanup (fix-what-we-touch)

1. **Move mutations from query layer:** `upsertAiSettings`, `upsertMcpEnabled`, `saveLayoutForUser` move from `src/queries/settings.ts` → `src/actions/settings.ts`. Query layer becomes read-only.

2. **Extract inline query from import page:** `src/app/(dashboard)/import/page.tsx` bypasses query layer. Extract to `getAccountsForImport(householdId)` in `src/queries/accounts.ts`.

3. **`copyBudgetFromMonth` transaction fix:** Refactor so `createBudget` accepts an optional `tx` parameter, allowing the caller to pass the transaction context through. Wrap the copy loop in `db.transaction()`.

4. **`mcpEnabled` comparison fix:** Change `row?.mcpEnabled === 1` to `row?.mcpEnabled === true` (or boolean truthiness) in `src/queries/settings.ts`.

---

## 6. Test Infrastructure

### Strategy: Shared container + per-file schema isolation

One Postgres container for the entire test run. Each test file gets its own Postgres schema for isolation.

### `tests/integration/setup.ts` — rewrite

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { randomUUID } from "crypto";
import * as schema from "@/db/schema";

export async function createTestDb() {
  const connectionString = process.env.DATABASE_URL
    || "postgresql://ledgr:ledgr@localhost:5432/ledgr_test";

  const schemaName = `test_${randomUUID().replace(/-/g, "")}`;
  const pool = new Pool({ connectionString });

  await pool.query(`CREATE SCHEMA "${schemaName}"`);
  await pool.query(`SET search_path TO "${schemaName}"`);

  const db = drizzle({ client: pool, schema });
  await migrate(db, { migrationsFolder: "src/db/migrations" });

  return {
    db,
    async close() {
      await pool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
      await pool.end();
    },
  };
}
```

### Vitest global setup (new file)

`tests/global-setup.ts` — starts a Testcontainers Postgres instance once, sets `DATABASE_URL` in env for all test files.

```typescript
import { PostgreSqlContainer } from "@testcontainers/postgresql";

let container;

export async function setup() {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  process.env.DATABASE_URL = container.getConnectionUri();
}

export async function teardown() {
  await container?.stop();
}
```

### `vitest.config.ts` updates

- Add `globalSetup: ["./tests/global-setup.ts"]`
- Increase test timeout for integration tests: `testTimeout: 30_000`
- Add dev dependency: `@testcontainers/postgresql`

### Test file migration

All integration tests change from:
```typescript
const { db, close } = createTestDb();
afterAll(() => close());
```
To:
```typescript
let db: LedgrDb;
let close: () => Promise<void>;
beforeAll(async () => { ({ db, close } = await createTestDb()); });
afterAll(async () => { await close(); });
```

Fix `dashboard-actions.test.ts` which currently calls `createTestDb()` at module scope (existing bug).

### CI strategy

GitHub Actions: use `services: postgres:17-alpine` instead of testcontainers. Set `DATABASE_URL` to the service container connection string. `createTestDb()` detects the existing `DATABASE_URL` and skips testcontainer startup.

---

## 7. Docker & Deployment

### `docker-compose.yml`

```yaml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: ledgr
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-ledgr}
      POSTGRES_DB: ledgr
    command: >
      postgres
        -c shared_buffers=256MB
        -c work_mem=16MB
        -c maintenance_work_mem=64MB
        -c random_page_cost=1.1
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ledgr"]
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    build: .
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://ledgr:${POSTGRES_PASSWORD:-ledgr}@db:5432/ledgr
    ports:
      - "3000:3000"

volumes:
  pgdata:
```

### `Dockerfile`

- Remove `RUN mkdir -p data && chown nextjs:nodejs data`
- Remove SQLite data directory setup

### `.env.example`

- Remove: `DATABASE_PATH`
- Add: `DATABASE_URL=postgresql://ledgr:ledgr@localhost:5432/ledgr`

### Dev convenience scripts (`package.json`)

```json
{
  "dev:db": "docker compose up db -d",
  "dev:setup": "pnpm dev:db && until pg_isready -h localhost -p 5432; do sleep 1; done && pnpm db:migrate && pnpm dev"
}
```

---

## 8. Migrations

- Delete all 15 existing SQLite migration SQL files in `src/db/migrations/`
- Delete `src/db/migrations/meta/` journal files
- Update all schema files to `drizzle-orm/pg-core` FIRST
- Then run `pnpm db:generate` to produce fresh Postgres DDL
- Greenfield — no data migration needed. Explicitly: existing SQLite data is abandoned.

---

## 9. Files Changed — Complete Inventory

| Category | Files | Count |
|----------|-------|-------|
| Schema | `src/db/schema/*.ts` (all 13) | 13 |
| DB init | `src/db/index.ts`, `drizzle.config.ts` | 2 |
| Auth | `src/lib/auth/index.ts` | 1 |
| Query helpers | `src/lib/scoped-query.ts`, `src/lib/query-helpers.ts` | 2 |
| Queries (async + SQL fixes) | `src/queries/*.ts` (all 11) | 11 |
| Actions (async + cleanups) | `src/actions/*.ts` (all 12) | 12 |
| Lib (async) | `spending-helpers.ts`, `plaid/*.ts`, `categorization/*.ts`, `ai/*.ts`, `auth/*.ts`, `jobs/*.ts`, `import/*.ts` | ~15 |
| Pages | `import/page.tsx` (extract query) | 1 |
| API routes | `health/route.ts`, dashboard routes | 3 |
| Tests | `tests/integration/setup.ts`, `tests/global-setup.ts` (new), all 33 test files | 35 |
| Config | `vitest.config.ts`, `docker-compose.yml`, `Dockerfile`, `.env.example`, `package.json` | 5 |
| Migrations | Delete 15 old SQL files, regenerate | 15 deleted |

**Total: ~100 files touched, 1 new file (global-setup.ts), 15 deleted (old migrations).**

---

## 10. Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Sync→async missed somewhere → silent Promise bugs | TypeScript strict mode catches most; `pnpm typecheck` must pass before any manual testing |
| Auth adapter incompatibility | Verify Better Auth Postgres adapter behavior with native timestamps in a spike before full migration |
| Transaction callbacks not awaited | Search for all `db.transaction(` call sites, ensure all are async |
| Test suite slow | Shared container + schema isolation; CI uses `services:` |
| `mcpEnabled === 1` silently breaks | Covered in migration checklist |
| Pool exhaustion under load | Explicit pool config + statement timeout |

---

## 11. Non-Goals (Explicitly Out of Scope)

- Dual-dialect SQLite/Postgres support
- Converting TEXT date columns to native DATE type
- Refactoring DashboardGrid god-component
- Moving JS-side aggregation to SQL (reports)
- AI chat tools DB injection
- Data migration from existing SQLite
