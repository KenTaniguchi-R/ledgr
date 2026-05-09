# Ledgr — Build Order

Prioritized implementation roadmap. Plaid bank sync is the core feature. Phases 1-4 deliver a functional MVP.

## Current State (2026-05-09)

### Already Built
- Full Drizzle schema (20+ tables, migrated to SQL)
- DB client with WAL mode, pragmas, foreign keys
- AES-256-GCM encryption for access tokens and AI keys
- Money utilities (cents conversion, Plaid amount normalization)
- `scopedQuery()` household isolation wrapper
- Better Auth (server instance, React client, session middleware)
- Auth UI: login page, signup page, auth layout, AuthCard/LoginForm/SignupForm components
- Onboarding: auto household provisioning via Better Auth `databaseHooks` on signup, with category seeding
- Session helpers with self-healing household provisioning
- CallbackUrl sanitization (open redirect prevention)
- Default category seed data (8 groups, 32 categories)
- Dashboard layout + landing page stub
- shadcn/ui initialized (button, card, input, label)
- Health check API route (`/api/health`)
- Docker + docker-compose config
- Test infrastructure: `createTestDb()` factory, MSW Plaid stubs, Vitest, Stryker, Playwright
- Unit tests for encryption and money utils, integration tests for scoped queries + onboarding
- E2E tests for auth flow + health check
- All dependencies installed (plaid, better-auth, drizzle-orm, ai, node-cron, recharts, etc.)

### Not Yet Built
- No Plaid client, Link flow, sync engine, or webhooks
- No UI pages beyond stubs (transactions, accounts, budgets, reports, etc.)
- No queries layer or server actions
- No background job scheduler
- No demo seed data

---

## Phase 1 — Auth UI + Onboarding ✅

**Status:** Complete
**Implementation notes:**
- Onboarding is handled automatically via Better Auth `databaseHooks` — household + owner role + default categories are provisioned atomically on signup, so no separate `/onboarding` page was needed.
- Session helpers include self-healing: if a user somehow lacks a household, it's created on next session check.
- Auth pages use shadcn/ui components (AuthCard, LoginForm, SignupForm).
- E2E tests cover signup → redirect → dashboard flow.
- Integration tests verify provisioning atomicity, idempotency, and household isolation.

**Deliverables (completed):**
- `/app/(auth)/login/page.tsx` — email/password sign-in
- `/app/(auth)/signup/page.tsx` — registration form
- Auto household provisioning on signup (replaces explicit onboarding page)
- `src/db/seed/categories.ts` — default category groups/categories per household
- Integration tests for onboarding + E2E auth tests

---

## Phase 2 — Plaid Link + Token Exchange

**Status:** Not started
**Why second:** Plaid is the main feature. Everything downstream requires a `plaid_items` row with a valid encrypted access token. This is the entry point to all bank data.

**Deliverables:**
- `src/lib/plaid/client.ts` — Plaid API client singleton
- `/app/api/plaid/link-token/route.ts` — creates Plaid Link token
- Plaid Link UI component — loads Link JS, handles `onSuccess`
- `/app/api/plaid/exchange/route.ts` — exchanges public token, encrypts access token, fetches initial accounts
- Minimal accounts list page showing connected institutions + balances
- Integration tests: token exchange with MSW, encryption verification, household scoping

---

## Phase 3 — Transaction Sync Engine

**Status:** Not started
**Why third:** The core value — without transactions, there's no data to display, categorize, or budget against.

**Deliverables:**
- `src/lib/plaid/sync.ts` — cursor-based `transactions/sync` loop
  - Process added/modified/removed transactions
  - Handle pending → posted transitions via `pending_transaction_id`
  - Convert Plaid floats to cents, compute `normalized_amount`
  - Update account balances
  - Write `sync_log` entry
  - Atomic cursor update in single DB transaction
- Server action: `triggerSync(plaidItemId)` — manual sync button
- `src/lib/jobs/scheduler.ts` — node-cron, every-4-hours Plaid sync
- "Sync Now" button on accounts page
- Integration tests: sync with MSW mocks, cursor atomicity, pending→posted, removed soft-delete

---

## Phase 4 — Transactions UI + Categorization

**Status:** Not started
**Why fourth:** Makes synced data visible and usable. Completes the MVP.

**Deliverables:**
- `src/queries/transactions.ts` — `getTransactions()` with filters (date, account, category, reviewed)
- `/app/(dashboard)/transactions/page.tsx` — paginated transaction list
- Category assignment (inline dropdown per transaction)
- Reviewed toggle
- `src/lib/plaid/categorize.ts` — auto-categorization pipeline (rules → merchant default → uncategorized)
- Merchant normalization during sync
- App shell layout with nav sidebar
- shadcn/ui component setup (button, table, select, badge, dialog)
- Integration tests for query scoping, unit/property tests for categorization rules

---

## Phase 5 — Webhooks + Re-auth

**Status:** Not started
**Why:** Production reliability. Poll mode works initially, but webhooks make the app responsive. Re-auth prevents silent sync failures.

**Deliverables:**
- `/app/api/plaid/webhook/route.ts` — signature verification + event handlers
- Re-auth banner when `plaid_items.status = 'reauth_required'`
- Plaid Link update mode for re-authentication
- Error state display on accounts page
- Integration tests for webhook handler with MSW

---

## Phase 6 — Dashboard + Net Worth

**Status:** Not started
**Why:** First emotionally compelling moment — transforms raw numbers into a financial picture.

**Deliverables:**
- `src/queries/dashboard.ts` — net worth, monthly cash flow, spending by category
- `/app/(dashboard)/page.tsx` — dashboard with widgets (net worth, cash flow, category donut, recent transactions, account balances)
- Daily balance snapshot job (midnight cron)
- Net worth history chart from `balance_history`

---

## Phase 7 — Demo Mode

**Status:** Not started
**Why:** Critical for adoption — users must experience the product before configuring credentials.

**Deliverables:**
- `src/db/seed/demo-data.ts` — 3 accounts, 6 months of transactions, sample budget, savings goal
- `pnpm db:seed` command
- First-boot detection + "Load Demo Data" button
- Demo mode banner
- "Clear Demo Data" action

---

## Phase 8 — Budgets

**Status:** Not started

**Deliverables:**
- `src/queries/budgets.ts` — budget with spending vs limit per category
- `/app/(dashboard)/budgets/page.tsx` — monthly view with progress bars
- Server actions: `createBudget`, `setBudgetCategory`, `copyBudgetFromLastMonth`
- Budget creation wizard

---

## Phase 9 — Reports + CSV Export

**Status:** Not started

**Deliverables:**
- `src/queries/reports.ts` — spending by category, income vs expenses, category trends
- `/app/(dashboard)/reports/page.tsx` — charts with date/account filters
- CSV export server action
- Saved filters

---

## Phase 10 — Recurring Transactions + Bills

**Status:** Not started

**Deliverables:**
- `src/lib/plaid/recurring.ts` — Plaid `/transactions/recurring/get`
- Daily recurring detection job
- `/app/(dashboard)/bills/page.tsx` — calendar + list view

---

## Phase 11 — Investments

**Status:** Not started

**Deliverables:**
- `src/lib/plaid/investments.ts` — holdings + investment transaction sync
- Daily holdings snapshot job
- `/app/(dashboard)/investments/page.tsx` — portfolio overview, holdings table, performance chart

---

## Phase 12 — AI Assistant + CSV/OFX Import

**Status:** Not started

**Deliverables:**
- `src/lib/ai/categorize.ts` — batch AI categorization (BYOK)
- `/app/api/ai/chat/route.ts` — streaming chat endpoint
- `src/lib/import/csv.ts` — CSV parser + column mapper + deduplication
- `src/lib/import/ofx.ts` — OFX parser
- `/app/(dashboard)/settings/page.tsx` — AI provider config

---

## Phase 13 — Household Sharing + Goals

**Status:** Not started

**Deliverables:**
- Invite flow (email-based)
- Role-based access (owner/member/advisor)
- `/app/(dashboard)/goals/page.tsx` — goal cards with progress bars
- Account linking + manual contribution tracking
