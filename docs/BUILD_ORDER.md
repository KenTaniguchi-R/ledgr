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

## Phase 2 — Plaid Link + Token Exchange ✅

**Status:** Complete
**Implementation notes:**
- Plaid API client singleton with environment validation (`src/lib/plaid/client.ts`).
- Plaid Link flow implemented as a `PlaidLinkFlow` organism using `react-plaid-link`, with lazy token fetch.
- Token exchange via server actions (not API routes) — exchanges public token, encrypts access token with AES-256-GCM, fetches initial accounts.
- Account queries with scoped access and soft-delete filtering.
- Accounts page with loading skeleton, error boundary, and OAuth return route.
- Atomic/molecular/organism component hierarchy: BalanceDisplay, StatusBadge, AccountTypeIcon → AccountCard, InstitutionHeader, SummaryCard → AccountList, PlaidLinkFlow, AddManualAccountDialog.
- SidebarNav integrated into dashboard layout.
- Integration tests for exchange + account actions with MSW mocks; E2E tests for accounts page.

**Deliverables (completed):**
- `src/lib/plaid/client.ts` — Plaid API client singleton
- PlaidLinkFlow organism — loads Link JS, handles `onSuccess`
- Server actions for token exchange + account management
- `src/queries/accounts.ts` — scoped account queries
- `/app/(dashboard)/accounts/page.tsx` — accounts list with connected institutions + balances
- Plaid OAuth return route
- SidebarNav with navigation links
- Integration tests: token exchange with MSW, encryption verification, household scoping
- E2E tests for accounts page

---

## Phase 3 — Transaction Sync Engine ✅

**Status:** Complete
**Why third:** The core value — without transactions, there's no data to display, categorize, or budget against.

**Implementation notes:**
- Pipeline architecture: `fetchAllPages` (Plaid I/O with retry+backoff) → `processBatch` (pure transform) → `applyToDb` (single atomic SQLite transaction).
- Per-item in-process lock (`Map<string, Promise>`) prevents concurrent sync of same institution from cron + manual trigger racing.
- Account-type-aware amount normalization: depository accounts flip sign, credit/investment/loan preserve Plaid sign convention.
- Merchant normalization: trim + title-case, raw_names JSON array tracking, deduplication by normalized name.
- Pending → posted transitions detected via `pending_transaction_id`; pending row soft-deleted, posted row inserted.
- Plaid error classification: `ITEM_LOGIN_REQUIRED` etc → `reauth_required`; `INSTITUTION_DOWN` etc → `error` status.
- Zod runtime validation of every Plaid sync response page.
- UI: SyncStatusBadge atom, InstitutionHeader with hover-reveal "Sync Now" + relative time display, Sync All via `Promise.allSettled` client-side orchestration.
- Schema: UNIQUE index on `plaid_transaction_id`, composite index on merchants `(household_id, name)`, indexes on `plaid_items` and `sync_log`.
- 89 tests total: 8 `processBatch` unit tests, 8 integration tests (pagination, soft-delete, upsert, pending→posted, cursor atomicity, household isolation).

**Deliverables (completed):**
- `src/lib/plaid/sync.ts` — core sync engine (fetchAllPages, processBatch, applyToDb, syncInstitution)
- `src/lib/plaid/schemas.ts` — Zod schemas for Plaid sync response validation
- `src/lib/plaid/sync.test.ts` — colocated unit tests for processBatch
- `src/actions/sync.ts` — triggerSync server action with ownership verification
- `src/lib/jobs/scheduler.ts` — node-cron scheduler (every 4 hours)
- `src/components/atoms/sync-status-badge.tsx` — sync status visual indicator
- `src/components/molecules/institution-header.tsx` — updated with Sync Now button + last synced
- `src/components/organisms/account-list.tsx` — updated with sync state management + Sync All
- `src/queries/accounts.ts` — added lastSyncedAt to InstitutionGroup
- `tests/integration/transaction-sync.test.ts` — 8 integration tests
- Schema migration: UNIQUE + performance indexes

---

## Phase 4 — Transactions UI + Categorization ✅

**Status:** Complete
**Why fourth:** Makes synced data visible and usable. Completes the MVP.

**Implementation notes:**
- Pre-phase refactoring: removed dead "depository" from FLIP_SIGN_TYPES, added `db` param to `updateAccount`, preserved `categoryId`/`reviewed` in modified transaction upserts, inherited category on pending→posted transitions, atomized status reset inside `applyToDb`, removed dead plaidCategory computation.
- Pure categorization engine (`categorizeTransactions`) with rule priority + merchant default fallback, hooked into post-sync pipeline via `categorizeSyncedTransactions` (non-fatal).
- URL-driven filters via searchParams (date, account, category, search, reviewed). Cursor-based keyset pagination with base64-encoded `{date, id}` cursors.
- Optimistic per-row mutations: CategoryPicker and ReviewedCheckbox own local state, fire-and-forget server actions, revert on error. Per-row actions skip `revalidatePath`; bulk actions use it.
- Atomic design: AmountDisplay atom → CategoryPicker, ReviewedCheckbox, TransactionRow, TransactionFilters, TransactionEmptyState, BulkActionBar molecules → TransactionList organism.
- Shared test data factories (`tests/integration/helpers.ts`) for FK-safe test setup.
- 127 tests total: 8 categorization engine (6 unit + 2 property-based), 10 transaction queries, 6 transaction actions, 5 categorization-in-sync, 3 factory smoke tests.

**Deliverables (completed):**
- `src/lib/categorization/engine.ts` — pure categorization function + DB-aware `categorizeSyncedTransactions` wrapper
- `src/lib/categorization/engine.test.ts` — unit + property tests
- `src/queries/transactions.ts` — `getTransactions()` with filters, cursor pagination, joins
- `src/queries/categories.ts` — `getCategories()` grouped by category group
- `src/actions/transactions.ts` — 5 server actions (updateTransactionCategory, toggleReviewed, bulkUpdateCategory, bulkMarkReviewed, loadMoreTransactions)
- `src/components/atoms/amount-display.tsx` — color-coded amount display
- `src/components/molecules/category-picker.tsx` — compact Select with optimistic update
- `src/components/molecules/reviewed-checkbox.tsx` — dot toggle with optimistic update
- `src/components/molecules/transaction-row.tsx` — dense h-10 grid row
- `src/components/molecules/transaction-filters.tsx` — URL-driven filter bar with search debounce
- `src/components/molecules/transaction-empty-state.tsx` — context-aware empty state
- `src/components/molecules/bulk-action-bar.tsx` — sticky bulk action bar
- `src/components/organisms/transaction-list.tsx` — paginated list + selection + bulk actions
- `/app/(dashboard)/transactions/page.tsx` — server component with searchParams
- `/app/(dashboard)/transactions/loading.tsx` — skeleton loading state
- `/app/(dashboard)/transactions/error.tsx` — error boundary with retry
- `tests/integration/helpers.ts` — shared test data factories
- `tests/integration/helpers.test.ts` — factory smoke tests
- `tests/integration/transaction-queries.test.ts` — query integration tests
- `tests/integration/transaction-actions.test.ts` — action integration tests
- `tests/integration/categorization-sync.test.ts` — categorization-in-sync tests

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
