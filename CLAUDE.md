# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Ledgr** — a self-hostable, open-source personal finance app (AGPLv3). Currently being rebuilt from a Python/Flask/DuckDB prototype into a full-stack TypeScript app.

**Design spec:** `docs/superpowers/specs/2026-05-09-ledgr-design.md` — the authoritative reference for architecture, data model, and feature design. Read this before making architectural decisions.

## Stack (New — Being Built)

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| UI | shadcn/ui v4 + Tailwind v4 |
| Charts | Recharts v3 (via shadcn Chart) |
| ORM | Drizzle ORM 0.45 |
| Database | SQLite (WAL mode) |
| Auth | Better Auth |
| Bank Sync | Plaid Node SDK (optional — CSV import is first-class) |
| AI | Vercel AI SDK (BYOK — user brings own API key) |
| Background Jobs | node-cron |
| Testing | Vitest + fast-check + Playwright + Stryker + MSW |

## Key Conventions

- **All monetary amounts are INTEGER (cents).** $12.50 → 1250. Never use floats for money. Convert to display format at the UI layer via `lib/money.ts`.
- **Plaid amount convention:** Positive = debit/expense, negative = credit/income. `normalized_amount` column flips sign for human display.
- **Ownership enforcement:** Use `scopedQuery(householdId)` wrapper to auto-inject `household_id` filtering on all queries. Never write manual WHERE clauses for tenant isolation.
- **Encryption:** Plaid access tokens and AI API keys encrypted at app layer (aes-256-gcm, key from `ENCRYPTION_KEY` env var).
- **Plaid is optional.** CSV/OFX import is a first-class citizen. The app must work fully without Plaid configured.
- **No serverless.** SQLite requires persistent filesystem. Deployment target is Docker on VPS.

## Commands (New App)

```bash
# Development
pnpm install                     # Install dependencies
pnpm dev                         # Next.js dev server
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

## Commands (Legacy Prototype — Python)

The `*.py` files in the root and `react-dashboard/` are the old prototype. They use `uv` for package management and DuckDB.

```bash
uv sync                          # Install Python dependencies
uv run python app.py             # Old Plaid Link flow (port 8000)
uv run python sync_to_db.py      # Old sync script
```

## Architecture

```
Browser ──▶ Next.js App Router
              ├── Server Components ── read-only data (transactions, reports)
              ├── Server Actions ──── mutations (sync, categorize, budget CRUD)
              ├── API Routes ──────── Plaid webhooks, AI streaming, CSV import
              └── Client Components ── interactive UI (charts, forms)
                    │
              Drizzle ORM ──▶ SQLite (data/ledgr.db, WAL mode)
              Plaid Node SDK ──▶ Plaid API (sandbox/production via PLAID_ENV)
              Vercel AI SDK ──▶ User's LLM provider (Claude/OpenAI/Gemini)
              node-cron ──▶ Background jobs (sync, snapshots, categorization)
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
│   │   └── index.ts            # Drizzle client + SQLite PRAGMAs
│   ├── lib/
│   │   ├── plaid/              # Plaid client, sync logic
│   │   ├── ai/                 # AI categorization, chat
│   │   ├── auth/               # Better Auth config + adapter
│   │   ├── import/             # CSV/OFX parsers
│   │   ├── jobs/               # node-cron scheduler
│   │   ├── scoped-query.ts     # Household-scoped query wrapper
│   │   ├── encryption.ts       # AES encrypt/decrypt
│   │   └── money.ts            # Cents ↔ display helpers
│   ├── actions/                # Server Actions
│   └── queries/                # Server-side data fetching
├── tests/
│   ├── integration/
│   │   ├── setup.ts                # In-memory SQLite test DB factory
│   │   ├── db-factory.test.ts      # DB factory smoke tests
│   │   └── scoped-query.test.ts    # Household isolation integration tests
│   └── mocks/
│       ├── handlers.ts             # MSW handlers (Plaid API)
│       └── server.ts               # MSW server setup for Vitest
├── e2e/
│   └── health.spec.ts              # Playwright health check E2E
├── data/                           # SQLite DB + attachments (Docker volume)
├── vitest.config.ts
├── playwright.config.ts
├── stryker.config.json
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Data Model Highlights

20+ tables. Key entities: `households`, `accounts`, `transactions` (with `transaction_splits`, `transfer_pair_id`), `merchants`, `category_groups`/`categories`/`category_rules`, `budgets`/`budget_categories`, `recurring_transactions`, `goals`, `investment_holdings`/`holdings_history`/`investment_transactions`, `plaid_items`/`sync_log`.

See the design spec for full schema with indexes and constraints.

## Testing Architecture

**Design spec:** `docs/superpowers/specs/2026-05-09-testing-architecture-design.md`

| Layer | Tool | What It Tests |
|-------|------|--------------|
| Unit + Property | Vitest + fast-check | Pure logic (money, encryption, categorization rules) |
| Integration | Vitest + real SQLite (in-memory) | Drizzle queries, scoped-query isolation, server actions |
| Mutation | Stryker (incremental) | Whether tests actually catch bugs (not just coverage) |
| E2E | Playwright | Critical user journeys end-to-end |
| Contract | MSW + Zod | Plaid API response shapes |
| Static | TypeScript strict + ESLint | Type safety |

**Key conventions:**
- **Colocate unit tests** with source files (`money.test.ts` next to `money.ts`).
- **Integration tests** (need DB) go in `tests/integration/`.
- **E2E tests** go in `e2e/`.
- **No tests for declarative code** (schemas, configs, type definitions).
- **Test DB factory:** `createTestDb()` from `tests/integration/setup.ts` — fresh in-memory SQLite per test file with migrations applied and `foreign_keys = ON`.
- **Property-based tests** use `@fast-check/vitest`. API: `test.prop([arb])("name", fn)` — not `fc.test()`.
- **Scoped-query** accepts optional `db` parameter for testability: `scopedQuery(householdId, testDb)`.
- **MSW mocks** for Plaid API in `tests/mocks/`. Use `server` from `tests/mocks/server.ts` in Vitest.
- **Mutation testing gate:** Stryker breaks build below 60% mutation score, warns below 80%. Run incremental on PRs.
- **JavaScript -0 gotcha:** `normalizeAmount(0)` returns `-0`. Use `Math.abs()` when comparing zero.

**Test budget per work type:**
- Feature: 3-5 behavioral tests + property tests if financial math
- Bug fix: 2-3 regression tests proving the fix
- Refactor: 0 new tests (existing tests must pass)

**CI pipeline order:** typecheck → lint → vitest → stryker (incremental) → playwright

## Auto-Categorization Pipeline

1. User's manual category rules (pattern match, ordered by priority)
2. Merchant default category
3. LLM fallback (batch uncategorized → user's AI provider)
4. Uncategorized (flagged for review)
