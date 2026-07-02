# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Ledgr** — a self-hostable, open-source personal finance app (AGPLv3).

**Design spec:** `docs/superpowers/specs/2026-05-09-ledgr-design.md` — the authoritative reference for architecture, data model, and feature design. Read this before making architectural decisions.

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| UI | shadcn/ui v4 + Tailwind v4 |
| Charts | Recharts v3 (via shadcn Chart) |
| ORM | Drizzle ORM 0.45 |
| Database | PostgreSQL 18 (via node-postgres Pool) |
| Auth | Better Auth |
| Bank Sync | Plaid Node SDK (optional — CSV import is first-class) |
| AI | Vercel AI SDK (BYOK — user brings own API key) |
| Background Jobs | Standalone job functions (snapshot-balances, backfill-balances) |
| Testing | Vitest + fast-check + Playwright + Stryker + MSW |

## Key Conventions

- **All monetary amounts are INTEGER (cents).** $12.50 → 1250. Never use floats for money. Convert to display format at the UI layer via `lib/money.ts`.
- **Plaid amount convention:** Positive = debit/expense, negative = credit/income. `normalized_amount` column flips sign for human display.
- **Ownership enforcement:** Use `scopedQuery(householdId)` wrapper to auto-inject `household_id` filtering on all queries. Never write manual WHERE clauses for tenant isolation.
- **Encryption:** Plaid access tokens and AI API keys encrypted at app layer (aes-256-gcm, key from `ENCRYPTION_KEY` env var).
- **Plaid is the primary feature.** Bank sync via Plaid is the core experience. CSV/OFX import is available as a supplementary option for accounts not supported by Plaid.
- **Timestamps:** Use `new Date()` for all Postgres `timestamp` columns. Use `nowISO()` from `@/lib/date-utils` only for text date columns. Never use `new Date().toISOString()` for timestamp columns — Drizzle handles Date→Postgres conversion.
- **Deployment target:** Docker, self-hosted. `docker compose up` starts both Postgres and the app. Migrations run automatically on container startup via `scripts/docker-entrypoint.sh`.

## Commands

```bash
# Development
pnpm install                     # Install dependencies
pnpm dev:db                      # Start Postgres (Docker)
pnpm dev:setup                   # Start Postgres + migrate + dev server
pnpm dev                         # Next.js dev server (requires running Postgres)
pnpm db:generate                 # Generate Drizzle migrations
pnpm db:migrate                  # Run migrations
pnpm db:seed                     # Seed default categories + demo data
pnpm db:studio                   # Open Drizzle Studio

# Testing
pnpm test                        # Vitest unit + integration tests
pnpm test:watch                  # Vitest in watch mode
pnpm test:coverage               # Vitest with v8 coverage report
pnpm test:e2e                    # Playwright e2e tests
pnpm test:e2e:ui                 # Playwright with interactive UI
pnpm test:mutate                 # Stryker mutation testing (full)
pnpm test:mutate:incremental     # Stryker mutation testing (changed files only)
pnpm lint                        # ESLint
pnpm typecheck                   # TypeScript type checking

# Docker
docker compose up                # Run the full app
docker compose up --build        # Rebuild and run
```

## Architecture

```
Browser ──▶ Next.js App Router
              ├── Server Components ── read-only data (transactions, reports)
              ├── Server Actions ──── mutations (sync, categorize, budget CRUD)
              ├── API Routes ──────── Plaid webhooks, AI streaming, CSV import
              └── Client Components ── interactive UI (charts, forms)
                    │
              Drizzle ORM ──▶ PostgreSQL (via node-postgres Pool)
              Plaid Node SDK ──▶ Plaid API (sandbox/production via PLAID_ENV)
              Vercel AI SDK ──▶ User's LLM provider (Claude/OpenAI/Gemini)
              Jobs ──▶ Background tasks (sync, snapshots, categorization)
```

## Project Structure

```
ledgr/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (auth)/             # Login, signup, onboarding
│   │   ├── (dashboard)/        # Main app (accounts, transactions, budgets, etc.)
│   │   └── api/                # Plaid webhooks, AI chat, CSV import, health
│   ├── components/             # UI components (shadcn/ui, charts, dashboard widgets)
│   ├── db/
│   │   ├── schema/             # Drizzle schema files (one per domain)
│   │   ├── seed/               # Default categories + demo data
│   │   └── index.ts            # Drizzle client + node-postgres Pool
│   ├── lib/
│   │   ├── plaid/              # Plaid client, sync logic
│   │   ├── categorization/     # Rule engine, PFC mapping, orchestrator
│   │   ├── ai/                 # AI categorization, chat
│   │   ├── auth/               # Better Auth config + adapter
│   │   ├── import/             # CSV/OFX parsers
│   │   ├── jobs/               # Background job functions (snapshots, backfill)
│   │   ├── scoped-query.ts     # Household-scoped query wrapper
│   │   ├── encryption.ts       # AES encrypt/decrypt
│   │   ├── date-utils.ts       # Timestamp and date helpers (nowISO, todayDateString)
│   │   └── money.ts            # Cents ↔ display helpers
│   ├── actions/                # Server Actions
│   └── queries/                # Server-side data fetching
├── tests/
│   ├── integration/
│   │   ├── setup.ts                # Postgres test DB factory (per-file schema isolation)
│   │   ├── db-factory.test.ts      # DB factory smoke tests
│   │   └── scoped-query.test.ts    # Household isolation integration tests
│   ├── global-setup.ts             # Testcontainers Postgres lifecycle
│   └── mocks/
│       ├── handlers.ts             # MSW handlers (Plaid API)
│       └── server.ts               # MSW server setup for Vitest
├── e2e/
│   └── health.spec.ts              # Playwright health check E2E
├── scripts/
│   ├── docker-entrypoint.sh        # Container startup (migrate + serve)
│   ├── migrate.mjs                 # Standalone Drizzle migration runner
│   └── install-migrate-deps.mjs    # Installs migration deps from package.json versions
├── docker-compose.yml              # Postgres 18 + app services
├── Dockerfile                      # Multi-stage production build (Node 24 LTS)
├── vitest.config.ts
├── playwright.config.ts
├── stryker.config.json
└── .env.example
```

## Data Model Highlights

29 tables. Key entities: `households`, `accounts`, `transactions` (with `transaction_splits`, `transfer_pair_id`), `merchants`, `category_groups`/`categories`/`category_rules`, `budgets`/`budget_categories`, `recurring_transactions`, `investment_holdings`/`holdings_history`/`investment_transactions`, `plaid_items`/`sync_log`, `saved_reports`, `oauth_clients`/`oauth_codes`/`oauth_consents`/`oauth_refresh_tokens`.

See the design spec for full schema with indexes and constraints.

## Testing Architecture

**Design spec:** `docs/superpowers/specs/2026-05-09-testing-architecture-design.md`

| Layer | Tool | What It Tests |
|-------|------|--------------|
| Unit + Property | Vitest + fast-check | Pure logic (money, encryption, categorization rules) |
| Integration | Vitest + Postgres (testcontainers) | Drizzle queries, scoped-query isolation, server actions |
| Mutation | Stryker (incremental) | Whether tests actually catch bugs (not just coverage) |
| E2E | Playwright | Critical user journeys end-to-end |
| Contract | MSW + Zod | Plaid API response shapes |
| Static | TypeScript strict + ESLint | Type safety |

**Key conventions:**
- **Colocate unit tests** with source files (`money.test.ts` next to `money.ts`).
- **Integration tests** (need DB) go in `tests/integration/`.
- **E2E tests** go in `e2e/`.
- **No tests for declarative code** (schemas, configs, type definitions).
- **Test DB factory:** `createTestDb()` from `tests/integration/setup.ts` — async, creates a unique Postgres schema per test file for isolation. Shared testcontainer started via `tests/global-setup.ts`. Use `beforeAll(async () => { ({ db, close } = await createTestDb()); })` pattern.
- **Property-based tests** use `@fast-check/vitest`. API: `test.prop([arb])("name", fn)` — not `fc.test()`.
- **Scoped-query** accepts optional `db` parameter for testability: `scopedQuery(householdId, testDb)`.
- **MSW mocks** for Plaid API in `tests/mocks/`. Use `server` from `tests/mocks/server.ts` in Vitest.
- **Mutation testing gate:** Stryker breaks build below 60% mutation score, warns below 80%. Run incremental on PRs.
- **JavaScript -0 gotcha:** `normalizeAmount(0)` returns `-0`. Use `Math.abs()` when comparing zero.

**Test budget per work type:**
- Feature: 3-5 behavioral tests + property tests if financial math
- Bug fix: 2-3 regression tests proving the fix
- Refactor: 0 new tests (existing tests must pass)

### TDD Workflow (new work)

New features and bugfixes start **test-first** (superpowers `test-driven-development` skill). The red-green-refactor loop, mapped to this repo:

1. **Red** — write the smallest failing test next to the code (`*.test.ts` colocated, or `tests/integration/` if it needs the DB). Run it and watch it fail:
   - `pnpm test:changed` — runs only tests related to your changed files (fast loop)
   - or `pnpm test:watch` for continuous feedback
2. **Green** — write the minimal code to pass. Re-run until green.
3. **Refactor** — clean up with tests staying green.
4. **Commit** — the `pre-commit` hook (`simple-git-hooks` + `lint-staged`) runs `eslint --fix` + `vitest related --run` on changed files. A failing related test blocks the commit. (DB-related changes pull in integration tests, which need Docker running.)

Enforcement layers, fast → slow: `test:changed`/watch → pre-commit hook → CI. If CI is red, the merge is blocked (once branch protection requires the `test` check).

**Time in tests:** never hardcode absolute dates that must fall in a "recent" window — queries compute windows from `new Date()`, so hardcoded dates silently rot as the calendar moves. Derive fixture dates relative to now (see `dashboard-queries.test.ts`).

**CI pipeline order:** typecheck → lint → vitest → stryker (incremental). Wired in `.github/workflows/ci.yml` (runs on push to `main` + all PRs; mutation is PR-only). Playwright is not yet in the blocking job.

## Auto-Categorization Pipeline

1. **User rules** — pattern matching on transaction name or merchant (ordered by priority)
2. **Merchant default** — if `merchant.categoryId` is set by user
3. **PFC mapping** — Plaid's `personal_finance_category.detailed` code mapped to seed categories via static map in `lib/categorization/pfc-map.ts`
4. **AI fallback** — batch uncategorized transactions → user's AI provider (confidence-gated)
5. Uncategorized — flagged for manual review

Each tier sets `categorySource` on the transaction (`"rule"` | `"merchant_default"` | `"pfc"` | `"ai"` | `"manual"`) to track provenance. Manual user edits always set `"manual"` and are never overwritten by lower tiers.
