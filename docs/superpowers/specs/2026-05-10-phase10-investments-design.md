# Phase 10 — Investments: Design Spec

**Date:** 2026-05-10
**Status:** Approved
**Depends on:** Phase 2 (Plaid Link), Phase 3 (Transaction Sync Engine)
**Independent of:** Phase 9 (Recurring Transactions)

## Overview

Full investment portfolio tracking with Monarch Money-level parity. Syncs holdings and investment transactions from Plaid, snapshots daily for performance history, and presents a data-dense brokerage-style UI with portfolio overview, allocation breakdown, holdings table, and investment transaction history.

## Scope

### In Scope
- Investment holdings sync via Plaid `investmentsHoldingsGet`
- Investment transactions sync via Plaid `investmentsTransactionsGet` (full 24-month history)
- Daily holdings snapshots for performance tracking (on-sync + daily cron safety net)
- Portfolio overview: total value, day change, total gain/loss
- Portfolio value history chart (AreaChart with gradient)
- Asset allocation donut chart (by security type, toggleable to sector)
- Holdings table with consolidated and per-account views
- Per-security detail drawer (Sheet)
- Investment transactions list with filters (type, account, date)
- Dashboard widget (total investments + day change)
- Sidebar navigation entry

### Out of Scope
- Real-time price feeds (Plaid institution-reported prices only)
- Trading/execution (monitoring only)
- Benchmark comparison (future enhancement)
- Time-weighted returns calculation (future enhancement)

## Schema Migration

Before any implementation, apply a schema migration to add missing columns and constraints:

1. **Add `sector` column** to `investment_holdings`: `sector text("sector")` — needed for allocation breakdown by sector.
2. **Add unique index** on `holdings_history`: `UNIQUE(account_id, plaid_security_id, date)` — required for `INSERT OR IGNORE` to work correctly. Without this, every snapshot duplicates rows.
3. **Add unique index** on `investment_transactions`: `UNIQUE(plaid_investment_transaction_id)` — required for `INSERT OR IGNORE` deduplication. Without this, every sync re-inserts 24 months of transactions.

Run `pnpm db:generate` + `pnpm db:migrate` after schema changes.

## Backend Architecture

### Plaid Link Update

The existing Plaid Link token creation must include `investments` in the `products` array. Without this, investment accounts will link successfully but `investmentsHoldingsGet` will always return `PRODUCTS_NOT_SUPPORTED`. Update the Link token creation action/route to request `["transactions", "investments"]`.

### Shared Plaid Utilities Extraction

Before building the investments module, extract shared utilities from `src/lib/plaid/sync.ts` into a new `src/lib/plaid/utils.ts`:

- `retryWithBackoff<T>(fn, maxAttempts): Promise<T>` — exponential backoff with jitter
- `REAUTH_ERROR_CODES: Set<string>` — 7 codes that trigger reauth_required status
- `TRANSIENT_ERROR_CODES: Set<string>` — 6 codes for temporary failures
- `SKIP_ERROR_CODES: Set<string>` — new set containing `PRODUCTS_NOT_SUPPORTED` and `PRODUCT_NOT_READY` for non-fatal skips. `PRODUCT_NOT_READY` fires during the initial sync window when Plaid hasn't finished fetching historical investment data (can take minutes to hours after Link completion).

Update `sync.ts` to import from `utils.ts` instead of defining locally.

### Zod Schemas

Add to `src/lib/plaid/schemas.ts`:

```typescript
PlaidSecuritySchema        // security_id, name, ticker_symbol, type, iso_currency_code, close_price, sector, industry
PlaidHoldingSchema         // account_id, security_id, quantity, institution_price, institution_value, cost_basis
PlaidInvestmentTxnSchema   // investment_transaction_id, account_id, security_id, type, subtype, quantity, price, amount, fees, date, name
PlaidHoldingsResponseSchema     // { holdings: [], securities: [], accounts: [] }
PlaidInvestmentTxnsResponseSchema // { investment_transactions: [], securities: [], total_investment_transactions: number }
```

Security type mapping: `"equity"→"stock"`, `"etf"→"etf"`, `"mutual fund"→"mutual_fund"`, `"fixed income"→"bond"`, `"cryptocurrency"→"crypto"`, `"cash"→"cash"`, `*→"other"`.

### Investment Sync Engine

New file: `src/lib/plaid/investments.ts`

Follows the same 3-stage pipeline as the transaction sync engine, adapted for investments:

#### Stage 1: Fetch

```typescript
export async function fetchHoldings(
  client: PlaidApi,
  accessToken: string,
): Promise<{ holdings: PlaidHolding[]; securities: PlaidSecurity[] }>
```

Single Plaid call. Plaid returns up to 500 holdings per call with no pagination mechanism and no `total_holdings` count. For typical retail portfolios this is a non-issue; households with 500+ positions could silently lose data. Document this limit but don't over-engineer a workaround for a rare edge case. Zod-validates the response.

```typescript
export async function fetchAllInvestmentTransactionPages(
  client: PlaidApi,
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<{ transactions: PlaidInvestmentTxn[]; securities: PlaidSecurity[] }>
```

Offset-based pagination loop. Increments offset by `response.investment_transactions.length` until `offset >= total_investment_transactions`. Safety cap at 50 iterations to prevent infinite loops on API bugs. (Default page size is 100; Plaid accepts a `count` parameter up to 500, so actual transaction count at cap varies.)

#### Stage 2: Process (Pure Functions)

```typescript
export function processHoldings(
  rawHoldings: PlaidHolding[],
  securities: PlaidSecurity[],
  householdId: string,
  plaidToInternalAccount: Map<string, string>,
): HoldingRow[]
```

- Builds security lookup map by `security_id`
- Converts `institution_value` and `cost_basis` to integer cents
- Maps security type enum
- Denormalizes security name, ticker, type, sector onto each holding row
- Skips holdings whose `account_id` has no match in `plaidToInternalAccount`

```typescript
export function processInvestmentTransactions(
  rawTxns: PlaidInvestmentTxn[],
  securities: PlaidSecurity[],
  plaidToInternalAccount: Map<string, string>,
): InvestmentTxnRow[]
```

- Converts `amount`, `price`, `fees` to integer cents
- Maps transaction type and subtype
- Denormalizes security name and ticker

#### Stage 3: Apply (Atomic DB Write)

```typescript
export async function applyInvestmentsToDb(
  db: LedgrDb,
  holdingRows: HoldingRow[],
  txnRows: InvestmentTxnRow[],
  itemId: string,
  householdId: string,
): Promise<{ holdingsUpserted: number; txnsInserted: number }>
```

The `plaidToInternalAccount` map is built by the orchestrator before calling Stage 2, and passed to both `processHoldings`/`processInvestmentTransactions` (Stage 2) and `applyInvestmentsToDb` (Stage 3). This matches the existing pattern in `sync.ts` where `doSync` builds the map pre-process.

Inside a single `db.transaction()`:
1. **Holdings: full replace** — `DELETE FROM investment_holdings WHERE account_id IN (item's accounts)` then bulk INSERT. Holdings are a point-in-time snapshot; there is no "modified" concept.
2. **Investment transactions: INSERT OR IGNORE** on `plaid_investment_transaction_id` (requires unique index). Never delete — Plaid doesn't send removals for investment transactions.
3. **Snapshot: INSERT OR IGNORE** into `holdings_history` for today's date (requires unique index on `(accountId, plaidSecurityId, date)`).

#### Orchestrator

```typescript
const activeInvestmentSyncs = new Map<string, Promise<InvestmentSyncResult>>();

export async function syncInvestments(
  itemId: string,
  householdId: string,
  db: LedgrDb,
): Promise<InvestmentSyncResult>
```

- `db` is required (not optional) — matches `syncInstitution` pattern; caller (scheduler) always has a db reference
- Per-item in-process locking (same pattern as transaction sync)
- Builds `plaidToInternalAccount` map before calling Stage 2, passes to both process and apply stages
- Decrypts access token, calls fetch → process → apply
- `PRODUCTS_NOT_SUPPORTED` or `PRODUCT_NOT_READY` → non-fatal skip (returns `{ skipped: true }`)
- Reauth/transient errors → update item status (reuses shared error classification)

### Critical Amount Convention

Investment transaction amounts must **NOT** go through `normalizeAmount()`. That function is built for the debit-positive/credit-negative spending convention. Investment amounts from Plaid are already cash-flow-correct:
- Positive = cash outflow (purchases)
- Negative = cash inflow (sales/dividends)

Store raw cents directly. Negate only for UI display of "proceeds."

### Fees Convention

`fees` in Plaid investment transactions are typically non-negative (costs), but some institutions report negative values for fee reversals/rebates. Store the raw value as-is (do not `Math.abs`). A fee rebate of `-5.00` becomes `-500` cents — this is semantically correct as a cost reduction.

### Cost Basis

`cost_basis` is nullable in Plaid responses. Store `null`, never default to 0. Zero and null have different semantics for tax calculations.

### Investment Webhooks (Deferred)

Plaid fires `HOLDINGS: DEFAULT_UPDATE` and `INVESTMENTS_TRANSACTIONS: DEFAULT_UPDATE` webhooks when investment data refreshes. These are **not handled in Phase 10** — the existing webhook handler will silently ignore them. The 4-hour cron provides a fallback, but holdings can be stale for up to 4 hours after an institution reports a trade. This is an acceptable tradeoff for Phase 10; webhook handling for investments can be added alongside the Phase 5 webhook infrastructure.

### Securities Data Drift

Historical `investment_transactions` use `INSERT OR IGNORE` and are never updated. If a security undergoes a name/ticker change (e.g., FB → META), old transaction rows retain the old ticker. This is technically correct for historical records but means filtering by current ticker may miss old transactions. Document this as a known limitation; a future enhancement could add a `security_aliases` lookup.

### Scheduler Integration

**Every 4 hours** (existing cron): After transaction sync and recurring sync, add investment sync for items that have at least one `type = 'investment'` account. Filter by joining `plaid_items → accounts WHERE type = 'investment'`.

**Daily 1am** (new cron): `snapshotHoldings()` — reads current `investment_holdings`, writes to `holdings_history` with `INSERT OR IGNORE`. Safety net ensuring no gaps in performance history even if a sync fails.

```typescript
export async function snapshotHoldings(dbInstance?: LedgrDb): Promise<void>
```

### Household Isolation

Investment tables do **not** have a direct `household_id` column. Isolation is enforced through the FK chain: `investment_holdings.account_id → accounts.household_id`. All queries must join through the `accounts` table for household scoping.

## Query Layer

New file: `src/queries/investments.ts`

### getPortfolioSummary(householdId)

Returns: `{ totalValue: number, dayChange: number | null, totalGainLoss: number, totalCostBasis: number }`

- `totalValue`: SUM of `currentValue` from `investment_holdings` joined through accounts
- `dayChange`: compare total value from today's `holdings_history` vs yesterday's (specific calendar dates, not "latest two arbitrary dates"). If either date has no rows, returns `null`. Using specific dates avoids mixed-date comparisons when accounts sync at different times.
- `totalGainLoss`: `totalValue - totalCostBasis`
- `totalCostBasis`: SUM of `costBasis` (excluding nulls)

### getPortfolioHistory(householdId, dateRange)

Returns: `PortfolioPoint[]` — `{ date: string, value: number }`

Aggregates from `holdings_history`: `GROUP BY date, SUM(value)` within the date range, joined through accounts for household isolation.

### getAssetAllocation(householdId)

Returns: `AllocationSlice[]` — `{ type: string, value: number, percentage: number }`

Groups `investment_holdings` by security type (`type` column), sums `currentValue`. Calculates percentage of total. Joined through accounts.

### getHoldings(householdId, view, accountId?)

Returns: `HoldingRow[]`

- **Consolidated view** (`view="consolidated"`): `GROUP BY ticker`, `SUM(currentValue)`, `SUM(costBasis)`, `SUM(quantity)`. Securities with null ticker group by `securityName` fallback.
- **Per-account view** (`view="by-account"`): Raw rows with account name included.
- Optional `accountId` filter for drilling into a specific account.

Each row includes: ticker, securityName, type, sector, quantity, currentPrice, currentValue, costBasis, gainLoss, gainLossPercent.

**No pagination** — `getHoldings` returns all rows unbounded. Typical retail portfolios have <100 holdings; even large portfolios cap at ~500 (Plaid's limit). Client-side sorting is safe because the full dataset is always present.

### getInvestmentTransactions(householdId, filters, cursor?)

Returns: `InvTxnPage` — `{ transactions: InvTxnRow[], nextCursor: string | null }`

Cursor-based keyset pagination (same pattern as `getTransactions`). Filters: date range, transaction type (buy/sell/dividend/fee/transfer/cash), account. Joined through accounts for household scoping.

### getInvestmentsSummary(householdId)

For the dashboard widget. Returns: `{ totalValue: number, dayChange: number | null }`

Lightweight version of `getPortfolioSummary`.

## Server Actions

New file: `src/actions/investments.ts`

```typescript
"use server"

export async function triggerInvestmentSync(plaidItemId: string)
  // Verify ownership via scoped query, call syncInvestments, revalidatePath

export async function loadMoreInvestmentTransactions(cursor: string, filters)
  // Pagination action for the transaction list
```

## Frontend Architecture

### Route Structure

Single route: `/investments?tab=holdings|transactions&view=consolidated|by-account`

URL-driven tabs — same pattern as the reports page. No sub-routes.

### Page Files

```
src/app/(dashboard)/investments/
  page.tsx          — async server component, reads searchParams, parallel-fetches queries
  loading.tsx       — skeleton matching 3-zone layout (header cards + charts + table)
  error.tsx         — standard error boundary with retry
```

`page.tsx` data fetching:
```typescript
const [summary, history, allocation, holdings, transactions] = await Promise.all([
  getPortfolioSummary(householdId),
  getPortfolioHistory(householdId, dateRange),
  getAssetAllocation(householdId),
  tab === "holdings" ? getHoldings(householdId, view) : null,
  tab === "transactions" ? getInvestmentTransactions(householdId, filters) : null,
]);
```

### Component Hierarchy

#### Existing Components to Extend (3 refactors)

**`net-worth-area-chart.tsx` → generalize**
- Currently tied to `NetWorthPoint[]` and multi-series layout
- Refactor to accept generic `{ date: string; value: number }[]` data with configurable series name
- Reuse for portfolio value history (single-series AreaChart with gradient)
- Avoids creating a duplicate `portfolio-value-history-chart.tsx`

**`spending-chart.tsx` → generalize**
- Currently tied to spending category data
- Refactor to accept generic `{ name: string; value: number }[]` interface
- Reuse for asset allocation donut (same PieChart/donut + legend structure)
- Add "By Type" / "By Sector" toggle via prop
- Avoids creating a duplicate `asset-allocation-chart.tsx`

**`comparison-badge.tsx` → extend**
- Already does percentage change with up/down indicator and color coding
- Add optional `pill?: boolean` prop for pill shape variant
- Add explicit `null` handling (renders "—")
- Reuse for holding gain/loss display
- Avoids creating a duplicate `holding-change-badge.tsx`

#### Atoms (1 new)

**`investment-type-badge.tsx`**
- Maps security type enum to colored shadcn `Badge`
- Types: Stock, ETF, Mutual Fund, Bond, Crypto, Cash, Other
- No existing analog — genuinely new

#### Organisms (4 new — includes reclassified `portfolio-summary-header`)

**`portfolio-summary-header.tsx`** (organism, not molecule)
- Three `SummaryCard`s: Total Value, Day Change (with `ComparisonBadge`), Total Gain/Loss
- Responsive: 3-col on desktop, stacked on mobile
- Classified as organism because it aggregates multiple molecules in a layout (same level as `dashboard-grid.tsx`)

**`holding-row.tsx`**
- Dense grid row: ticker | name | type badge | shares | price | value | cost basis | gain/loss %
- Click opens `Sheet` (shadcn) with security detail
- Formats quantity with `toFixed(4)` stripped of trailing zeros
- Formats money with `centsToDisplay`

**`investment-transaction-row.tsx`**
- Grid row: date | type badge | security name | qty × price | amount
- Type badge color-coded: buy=blue, sell=red, dividend=green, fee=orange

**`investment-filters.tsx`**
- Date range picker + type multi-select (buy/sell/dividend/fee/transfer/cash) + account select
- URL-driven (pushes searchParams)

**`holdings-table.tsx`** (`"use client"`)
- `ToggleGroup` for Consolidated | By Account → `router.push` with `?view=` param
- Optional account filter dropdown in per-account view
- Renders `HoldingRow[]` with sticky header
- Sort by value, gain/loss, name (client-side — safe because `getHoldings` returns all rows unbounded)

**`investment-transaction-list.tsx`** (`"use client"`)
- Cursor-based load-more (structural clone of `transaction-list.tsx`)
- Renders `InvestmentTransactionRow[]`
- `InvestmentFilters` at top

**`investment-page-layout.tsx`** (`"use client"`)
- Receives `activeTab` and all pre-fetched data as props from `page.tsx` (server component reads `searchParams` and passes resolved values — follows reports page pattern exactly)
- Does NOT own URL routing — tab switching calls `router.push` only for the view toggle within holdings
- Renders: PortfolioSummaryHeader → charts row → Tabs (Holdings | Transactions)

#### Dashboard Widget

**`investments-widget.tsx`**
- Total portfolio value + day change badge
- Data passed from dashboard page (no self-fetching)
- Register in `registry.ts`, remove placeholder flag

### Sidebar Navigation

Add to `NAV_ITEMS` in `sidebar-nav.tsx`:
```typescript
{ href: "/investments", label: "Investments", icon: TrendingUp }
```

Positioned between Accounts and Transactions.

### Empty State

When no investment accounts are linked, `investment-page-layout.tsx` renders a CTA pointing to Plaid Link — same pattern as the accounts page empty state.

### Design Direction

Data-dense but clean brokerage aesthetic:
- Gradient-fill area chart for portfolio history (not a flat line)
- `tabular-nums` on all financial figures for column alignment
- Dense holding rows (similar to transaction rows)
- Sheet drawer for security detail (not a separate page)
- Sector breakdown as a column + allocation donut toggle (no separate chart)

## Testing Strategy

### Test Data Factories

Add to `tests/integration/helpers.ts`:
- `insertInvestmentHolding(db, accountId, overrides)` — note: takes `accountId` (not `householdId`) as the relational param, since investment tables use FK chain isolation
- `insertHoldingsSnapshot(db, accountId, date, overrides)`
- `insertInvestmentTransaction(db, accountId, overrides)`

The existing `insertAccount` factory works with `{ type: 'investment' }` override.

### Unit Tests (colocated)

**`src/lib/plaid/investments.test.ts`** (10-12 tests):
- `processHoldings`: type mapping, cents conversion, null cost basis preserved as null, skip unknown accounts, holding with missing security_id in lookup (edge case)
- `processInvestmentTransactions`: amount/price/fees conversion, type mapping, negative fees preserved
- Property-based tests (fast-check) for `processHoldings` on arbitrary quantity/price inputs
- Property-based test asserting `processInvestmentTransactions` never produces `-0` in any field for zero-valued inputs

### Integration Tests

**`tests/integration/investment-sync.test.ts`** (8-10 tests):
- Full pipeline: holdings upsert, transaction insert-or-ignore
- Holdings full-replace (old holdings deleted on re-sync)
- Snapshot writing to holdings_history (unique constraint prevents duplicates)
- `snapshotHoldings` idempotency: calling twice on same date writes one row
- Household isolation via FK chain: insert two households with separate accounts + holdings, assert query for household 1 excludes household 2's data (must join through accounts, not use shortcut)
- PRODUCTS_NOT_SUPPORTED skip behavior (non-fatal, item status unchanged)
- PRODUCT_NOT_READY skip behavior
- Pagination safety cap (mock 51 pages, assert loop terminates at 50 iterations)
- `triggerInvestmentSync` action: ownership verification (reject sync for item not owned by household)

**`tests/integration/investment-queries.test.ts`** (6-8 tests):
- Consolidated vs per-account holdings
- Allocation grouping by type
- Day change calculation: today vs yesterday (both present), only today (returns null), neither (returns null)
- Portfolio history aggregation
- Investment transaction pagination + filters

### MSW Mocks

Add to `tests/mocks/handlers.ts`:
- `investmentsHoldingsGet` — returns fixture with 3 accounts, 5 holdings, 4 securities. Must include: one holding with `cost_basis: null`, one security with unmapped type (e.g., `"warrant"` → `"other"`)
- `investmentsHoldingsEmptyHandler` — returns `{ holdings: [], securities: [], accounts: [] }`
- `investmentsTransactionsGet` — returns fixture with offset pagination (2 pages)
- `investmentsProductsNotSupportedHandler` — returns `PRODUCTS_NOT_SUPPORTED` error response

### Test Budget

~28-32 tests total. No tests for Zod schemas, UI atoms/molecules, or loading/error pages.

## Build Sequence

| Step | What | Dependencies |
|------|------|-------------|
| 0 | Schema migration: add `sector` column, unique indexes on `holdings_history` and `investment_transactions` | None |
| 1 | Update Plaid Link token creation to include `investments` product | None |
| 2 | Extract shared Plaid utils to `utils.ts`, update `sync.ts` imports | None |
| 3 | Add Zod schemas for investment responses to `schemas.ts` | None |
| 4 | `processHoldings` + `processInvestmentTransactions` (pure) + unit tests + test factories | Step 3 |
| 5 | Fetch functions + MSW mock handlers | Steps 2, 3 |
| 6 | `applyInvestmentsToDb` + integration tests | Steps 4, 5 |
| 7 | `syncInvestments` orchestrator + scheduler wiring + `snapshotHoldings` | Step 6 |
| 8 | Query layer (`queries/investments.ts`) + integration tests | Step 6 |
| 9 | Server action (`triggerInvestmentSync`) | Steps 7, 8 |
| 10 | Refactor existing atoms: generalize `net-worth-area-chart`, `spending-chart`, extend `comparison-badge` | None |
| 11 | New atom: `investment-type-badge` | None |
| 12 | Molecules (3 row/filter components) | Steps 10, 11 |
| 13 | Organisms (4 — summary header, holdings table, transaction list, page layout) | Steps 12, 8 |
| 14 | Page + loading + error + sidebar nav | Steps 9, 13 |
| 15 | Dashboard widget + registry | Step 8 |

Backend-first (steps 0-9), then UI (steps 10-15). Each step is independently testable.

## Files Summary

### New Files (16)
- `src/lib/plaid/utils.ts`
- `src/lib/plaid/investments.ts`
- `src/lib/plaid/investments.test.ts`
- `src/queries/investments.ts`
- `src/actions/investments.ts`
- `src/app/(dashboard)/investments/page.tsx`
- `src/app/(dashboard)/investments/loading.tsx`
- `src/app/(dashboard)/investments/error.tsx`
- `src/components/atoms/investment-type-badge.tsx`
- `src/components/molecules/holding-row.tsx`
- `src/components/molecules/investment-transaction-row.tsx`
- `src/components/molecules/investment-filters.tsx`
- `src/components/organisms/portfolio-summary-header.tsx`
- `src/components/organisms/holdings-table.tsx`
- `src/components/organisms/investment-transaction-list.tsx`
- `src/components/organisms/investment-page-layout.tsx`
- `src/components/organisms/widgets/investments-widget.tsx`
- `tests/integration/investment-sync.test.ts`
- `tests/integration/investment-queries.test.ts`

### Modified Files (11)
- `src/db/schema/investments.ts` — add `sector` column, unique indexes
- `src/lib/plaid/sync.ts` — import shared utils from `utils.ts`
- `src/lib/plaid/schemas.ts` — add investment Zod schemas
- `src/lib/jobs/scheduler.ts` — add investment sync to 4h cron + daily snapshot job
- `src/components/atoms/net-worth-area-chart.tsx` — generalize to accept generic data interface
- `src/components/atoms/spending-chart.tsx` — generalize to accept generic data interface
- `src/components/molecules/comparison-badge.tsx` — add `pill` prop + null handling
- `src/components/organisms/sidebar-nav.tsx` — add Investments nav item
- `src/components/organisms/widgets/registry.ts` — register investments widget
- `src/queries/dashboard.ts` — add `getInvestmentsSummary()`
- `tests/mocks/handlers.ts` — add investment MSW mock handlers
- `tests/integration/helpers.ts` — add investment test data factories
- Plaid Link token creation action/route — add `investments` to products array
