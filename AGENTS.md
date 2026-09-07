# AGENTS.md

Guidance for AI coding agents working in this repository. This is the canonical
instructions file; `CLAUDE.md` imports it.

## Project Overview

**Ledgr** — a self-hostable, open-source personal finance app (AGPLv3).

Self-hosting is the only deployment model. There is no hosted product, so there
is one audience and one setup path; `docs/superpowers/specs/2026-07-07-ledgr-hosted-beta-design.md`
describes a direction that was abandoned.

Design docs live in `docs/superpowers/specs/` (design) and
`docs/superpowers/plans/` (execution). They are point-in-time records, not a
maintained spec — when a doc and the code disagree, the code wins.

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| UI | shadcn/ui v4 (`base-nova` style, Base UI primitives) + Tailwind v4 |
| Charts | Recharts v3 via shadcn Chart (`components/ui/chart.tsx`) |
| ORM | Drizzle ORM 0.45 |
| Database | PostgreSQL 18 (via node-postgres Pool) |
| Auth | Better Auth (+ passkeys) |
| Bank Sync | Plaid Node SDK and SimpleFIN — both first-class; CSV/OFX import for the rest |
| AI | Vercel AI SDK (BYOK — user brings own API key) |
| MCP | Ledgr exposes itself as an MCP server (`src/lib/mcp/`) with OAuth |
| Scheduling | `node-cron` scheduler (`src/lib/scheduler/`) driving job functions |
| Testing | Vitest + fast-check + Playwright + Stryker + MSW |

Note the UI primitives are **Base UI**, not Radix. APIs differ — `ToggleGroup`
takes `value: string[]` and hands back an empty array when the active item is
clicked again, `PopoverTrigger` takes a `render` prop, and so on. Read the
component in `src/components/ui/` before assuming a Radix signature.

## Key Conventions

- **All monetary amounts are INTEGER (cents).** $12.50 → 1250. Never use floats
  for money. Convert to display format at the UI layer via `lib/money.ts`.
- **Plaid amount convention:** Positive = debit/expense, negative = credit/income.
  `normalized_amount` flips sign for human display.
- **Ownership enforcement:** Use `scopedQuery(householdId)` to auto-inject
  `household_id` filtering. Never write manual WHERE clauses for tenant
  isolation. It takes an optional second `db` argument for tests.
- **Encryption:** Plaid/SimpleFIN tokens and AI API keys are encrypted at the app
  layer (aes-256-gcm). Keys are **versioned** — `ENCRYPTION_KEY` is v1,
  `ENCRYPTION_KEY_V2` and up are later versions, so rotation can re-wrap
  ciphertext without downtime (`pnpm rotate-keys`).
- **Timestamps:** Use `new Date()` for Postgres `timestamp` columns. Use
  `nowISO()` from `@/lib/date-utils` only for text date columns. Never
  `new Date().toISOString()` for timestamp columns — Drizzle handles the
  Date→Postgres conversion.
- **Transfers are excluded from spend.** Rows with `isTransfer` are left out of
  reports, budgets and spending totals. Investment-account activity is tagged
  `isTransfer: true` with `transferSource: "investment_account"` at sync time,
  which is what keeps brokerage fills out of the Transactions tab.
- **Deployment target:** Docker, self-hosted. `docker compose up` starts Postgres
  and the app; migrations run on container startup via
  `scripts/docker-entrypoint.sh`.

## Commands

```bash
# Development
pnpm install                     # Install dependencies
pnpm dev:db                      # Start Postgres (Docker)
pnpm dev:setup                   # Start Postgres + migrate + dev server
pnpm dev                         # Next.js dev server (requires running Postgres)
pnpm db:generate                 # Generate Drizzle migrations
pnpm db:migrate                  # Run migrations
pnpm db:studio                   # Open Drizzle Studio

# Testing
pnpm test                        # Vitest unit + integration
pnpm test:changed                # Only tests related to changed files (fast loop)
pnpm test:watch                  # Watch mode
pnpm test:coverage               # v8 coverage report
pnpm test:e2e                    # Playwright
pnpm test:mutate                 # Stryker (full)
pnpm test:mutate:incremental     # Stryker (changed files)
pnpm test:mutate:diff            # Stryker (diff vs main) — what CI runs on PRs
pnpm lint                        # ESLint
pnpm typecheck                   # tsc --noEmit

# Operations
pnpm reset-password --check|--set <email>   # Operator password check/reset
pnpm rotate-keys                            # Re-wrap encrypted columns to a new key version
pnpm backfill-clean-names                   # Backfill merchant-cleaned names
pnpm backfill-transfers                     # Backfill transfer pairing
pnpm backfill-investment-activity           # Tag existing investment rows as transfers
pnpm backfill-balances                      # Backfill balance history
pnpm build:mcp-widgets                      # Build the MCP app widgets
```

## Project Structure

```
src/
├── app/
│   ├── (auth)/                 # Login, signup
│   ├── (dashboard)/            # accounts, transactions, budgets, bills,
│   │                           # investments, reports, rules, import, settings
│   ├── api/                    # ai/chat, auth, dashboard, export, health,
│   │                           # import, mcp/oauth, plaid/{webhook,oauth-return}, search
│   ├── mcp/authorize/          # OAuth consent screen for MCP clients
│   └── .well-known/            # OAuth authorization-server + protected-resource metadata
├── components/
│   ├── atoms/ molecules/ organisms/   # Atomic-design layering
│   └── ui/                     # shadcn components — see "UI conventions"
├── db/schema/                  # Drizzle schema, one file per domain (30 tables)
├── lib/
│   ├── plaid/                  # Plaid client + sync
│   ├── simplefin/              # SimpleFIN client, schemas, sync, queries, recurring
│   ├── categorization/         # engine.ts, pfc-map.ts, rule-pattern.ts
│   ├── ai/                     # categorize, resolve-merchants, provider, chat
│   ├── mcp/                    # MCP server: tools/, auth/, apps/ (widgets)
│   ├── scheduler/              # cron config + runner + tasks
│   ├── jobs/                   # snapshot-balances, backfill-*, rotate-encryption-keys
│   ├── auth/ import/           # Better Auth config; CSV/OFX parsers
│   ├── scoped-query.ts encryption.ts money.ts date-utils.ts
├── actions/                    # Server Actions (mutations)
└── queries/                    # Server-side data fetching
tests/integration/              # DB-backed tests + testcontainers setup
e2e/                            # Playwright
```

## Auto-Categorization Pipeline

Tiers, in order. Each sets `categorySource` on the transaction to record
provenance:

1. **`rule`** — user pattern rules on transaction name or merchant, by priority
2. **`merchant_default`** — `merchant.categoryId`, when the user has set one
3. **`pfc`** — Plaid `personal_finance_category.detailed`, mapped in `pfc-map.ts`
4. **`ai`** — batch the remainder to the user's AI provider, confidence-gated
5. Uncategorized — flagged for manual review

`manual` is set by user edits and is never overwritten by a lower tier.

## UI conventions

- **Reach for `src/components/ui/` before hand-rolling.** Most of the library is
  already installed and wired. Install what is missing rather than rebuilding it.
- **`shadcn add` has two known hazards in this repo.** It emits
  `import { cn } from "cn"` and tries to install an npm package by that name, and
  it rewrites `package.json` dependency versions it should leave alone (it has
  downgraded `recharts` on every run). Check `git diff package.json` after any
  `add`, and answer **no** to overwrite prompts — `card.tsx` is customized.
- **`components/ui/chart.tsx` carries two deliberate local edits**, both commented
  in the file: `cn` is imported from `@/lib/utils`, and `ChartTooltipContent`
  takes a `valueFormatter` prop because every value this app charts is an integer
  cent count and upstream renders values with `toLocaleString()`. Do not let a
  regenerate clobber them.
- **Charts must go through `ChartContainer`.** Recharts' bare `<Tooltip>` paints a
  hardcoded white box that is unreadable in dark mode. Series labels come from
  `ChartConfig`, not per-series `name` props. Callers size charts with an
  explicit-height parent, so pass `className="aspect-auto h-full w-full"`.
- **Category names are user data** (`Groceries & Dining`) and cannot be emitted as
  `--color-<key>` custom properties. Charts keyed by category keep inline colors.
- **Not every raw element is a bug.** Clickable table rows, category pills and
  editable text are legitimately custom; `Button` is the wrong base for a `<tr>`.
  The hand-rolled `rounded-lg border` shells are also *visually distinct* from
  this repo's `Card` (`rounded-xl bg-card ring-1 ring-foreground/10`, no border) —
  converting them is a redesign, not a refactor.

## Testing Architecture

| Layer | Tool | What it tests |
|-------|------|--------------|
| Unit + Property | Vitest + fast-check | Pure logic (money, encryption, categorization) |
| Integration | Vitest + Postgres (testcontainers) | Drizzle queries, scoped-query isolation, actions |
| Mutation | Stryker (diff on PRs) | Whether tests actually catch bugs |
| E2E | Playwright | Critical user journeys |
| Contract | MSW + Zod | Plaid/SimpleFIN response shapes |
| Static | TypeScript strict + ESLint | Type safety |

- **Colocate unit tests** with source (`money.test.ts` next to `money.ts`).
  DB-backed tests go in `tests/integration/`, Playwright in `e2e/`.
- **Vitest is `environment: "node"` and matches `*.test.ts` only.** There is no
  jsdom project, so React component tests are not currently possible without a
  config change. Verify component work by running the app.
- **Test DB factory:** `createTestDb()` from `tests/integration/setup.ts` — async,
  one Postgres schema per test file. Use
  `beforeAll(async () => { ({ db, close } = await createTestDb()); })`.
- **Property tests** use `@fast-check/vitest`: `test.prop([arb])("name", fn)`.
- **No tests for declarative code** (schemas, configs, type definitions).
- **Time in tests:** never hardcode absolute dates that must land in a "recent"
  window — queries compute windows from `new Date()`, so fixed dates rot as the
  calendar moves. Derive fixture dates relative to now.
- **JavaScript `-0` gotcha:** `normalizeAmount(0)` returns `-0`. Use `Math.abs()`
  when comparing to zero.

**Budget per work type:** feature → 3-5 behavioral tests, plus property tests if
it touches financial math. Bug fix → 2-3 regression tests proving the fix.
Refactor → 0 new tests; the existing ones must pass.

### TDD workflow

Red (`pnpm test:changed` or `test:watch`) → green → refactor → commit. The
pre-commit hook runs `eslint --fix` only; it does not run tests, because
integration tests need Docker. The real gate is CI.

**CI:** typecheck → lint → vitest → Stryker (`mutation (diff)`, PR-only and
non-blocking). Runs on `.github/workflows/ci.yml`, on self-hosted runners.
Playwright is not yet in the blocking job.

CI reds on these runners are not always your code — contention between
container-heavy jobs, a shared pnpm store racing itself, and legacy mutation debt
on DB files all produce reds that look like breakage. Check which step failed and
re-run before assuming the diff is at fault.

## Database

Migrations are generated with `pnpm db:generate` and must be reviewed before
committing:

- **Generated `NOT NULL` column adds have no backfill** and will break a populated
  database. Rewrite the migration to add the column nullable, backfill, then set
  the constraint.
- **Never hand-edit a migration's `when` timestamp in the journal.** Older Docker
  images replay it and crash-loop.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
