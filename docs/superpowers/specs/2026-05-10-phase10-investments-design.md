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

## Backend Architecture

### Shared Plaid Utilities Extraction

Before building the investments module, extract shared utilities from `src/lib/plaid/sync.ts` into a new `src/lib/plaid/utils.ts`:

- `retryWithBackoff<T>(fn, maxAttempts): Promise<T>` — exponential backoff with jitter
- `REAUTH_ERROR_CODES: Set<string>` — 7 codes that trigger reauth_required status
- `TRANSIENT_ERROR_CODES: Set<string>` — 6 codes for temporary failures
- `SKIP_ERROR_CODES: Set<string>` — new set containing `PRODUCTS_NOT_SUPPORTED` for non-fatal skips

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

Single Plaid call, no pagination. Zod-validates the response.

```typescript
export async function fetchAllInvestmentTransactionPages(
  client: PlaidApi,
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<{ transactions: PlaidInvestmentTxn[]; securities: PlaidSecurity[] }>
```

Offset-based pagination loop. Increments offset by `response.investment_transactions.length` until `offset >= total_investment_transactions`. Safety cap at 50 pages (5,000 transactions) to prevent infinite loops.

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

Inside a single `db.transaction()`:
1. Build plaid→internal account ID lookup
2. **Holdings: full replace** — `DELETE FROM investment_holdings WHERE account_id IN (item's accounts)` then bulk INSERT. Holdings are a point-in-time snapshot; there is no "modified" concept.
3. **Investment transactions: INSERT OR IGNORE** on `plaid_investment_transaction_id`. Never delete — Plaid doesn't send removals for investment transactions.
4. **Snapshot: INSERT OR IGNORE** into `holdings_history` for today's date.

#### Orchestrator

```typescript
const activeInvestmentSyncs = new Map<string, Promise<InvestmentSyncResult>>();

export async function syncInvestments(
  itemId: string,
  householdId: string,
  db?: LedgrDb,
): Promise<InvestmentSyncResult>
```

- Per-item in-process locking (same pattern as transaction sync)
- Decrypts access token, calls fetch → process → apply
- `PRODUCTS_NOT_SUPPORTED` → non-fatal skip (returns `{ skipped: true }`)
- Reauth/transient errors → update item status (reuses shared error classification)

### Critical Amount Convention

Investment transaction amounts must **NOT** go through `normalizeAmount()`. That function is built for the debit-positive/credit-negative spending convention. Investment amounts from Plaid are already cash-flow-correct:
- Positive = cash outflow (purchases)
- Negative = cash inflow (sales/dividends)

Store raw cents directly. Negate only for UI display of "proceeds."

### Cost Basis

`cost_basis` is nullable in Plaid responses. Store `null`, never default to 0. Zero and null have different semantics for tax calculations.

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
- `dayChange`: compare total value from latest `holdings_history` date vs second-latest date. If only one date exists, returns `null`.
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

#### Atoms (4 new)

**`portfolio-value-history-chart.tsx`**
- Recharts `AreaChart` with single `Area`
- `linearGradient` SVG fill (primary color, 30% top opacity → 0% bottom)
- Time axis: `formatDateShort`, Y-axis: `centsToDisplay`
- Brokerage-quality gradient differentiates from generic area chart

**`asset-allocation-chart.tsx`**
- Recharts `PieChart`/`Pie` with `innerRadius` (donut)
- Same structure as existing `spending-chart.tsx`
- Right-panel CSS grid: color swatch | type name | value | %
- Toggle between "By Type" and "By Sector" via prop

**`holding-change-badge.tsx`**
- Green/red pill with triangle up/down + percentage
- `tabular-nums` font variant for alignment
- Handles null (renders "—")

**`investment-type-badge.tsx`**
- Maps security type enum to colored shadcn `Badge`
- Types: Stock, ETF, Mutual Fund, Bond, Crypto, Cash, Other

#### Molecules (4 new)

**`portfolio-summary-header.tsx`**
- Three `SummaryCard`s: Total Value, Day Change (with `HoldingChangeBadge`), Total Gain/Loss
- Responsive: 3-col on desktop, stacked on mobile

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

#### Organisms (3 new)

**`holdings-table.tsx`** (`"use client"`)
- `ToggleGroup` for Consolidated | By Account → `router.push` with `?view=` param
- Optional account filter dropdown in per-account view
- Renders `HoldingRow[]` with sticky header
- Sort by value, gain/loss, name (client-side)

**`investment-transaction-list.tsx`** (`"use client"`)
- Cursor-based load-more (structural clone of `transaction-list.tsx`)
- Renders `InvestmentTransactionRow[]`
- `InvestmentFilters` at top

**`investment-page-layout.tsx`** (`"use client"`)
- Top-level client shell
- Owns shadcn `Tabs` component driven by `?tab=` URL param
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

### Unit Tests (colocated)

**`src/lib/plaid/investments.test.ts`** (8-10 tests):
- `processHoldings`: type mapping, cents conversion, null cost basis handling, skip unknown accounts
- `processInvestmentTransactions`: amount/price/fees conversion, type mapping
- Property-based tests (fast-check) for `processHoldings` on arbitrary quantity/price inputs

### Integration Tests

**`tests/integration/investment-sync.test.ts`** (6-8 tests):
- Full pipeline: holdings upsert, transaction insert-or-ignore
- Holdings full-replace (old holdings deleted)
- Snapshot writing to holdings_history
- Household isolation via FK chain
- PRODUCTS_NOT_SUPPORTED skip behavior

**`tests/integration/investment-queries.test.ts`** (6-8 tests):
- Consolidated vs per-account holdings
- Allocation grouping by type
- Day change calculation (two dates, one date, no dates)
- Portfolio history aggregation
- Investment transaction pagination + filters

### MSW Mocks

Add to `tests/mocks/handlers.ts`:
- `investmentsHoldingsGet` — returns fixture with 3 accounts, 5 holdings, 4 securities
- `investmentsTransactionsGet` — returns fixture with offset pagination (2 pages)

### Test Budget

~20-25 tests total. No tests for Zod schemas, UI atoms/molecules, or loading/error pages.

## Build Sequence

| Step | What | Dependencies |
|------|------|-------------|
| 1 | Extract shared Plaid utils to `utils.ts`, update `sync.ts` imports | None |
| 2 | Add Zod schemas for investment responses to `schemas.ts` | None |
| 3 | `processHoldings` + `processInvestmentTransactions` (pure) + unit tests | Step 2 |
| 4 | Fetch functions + MSW mock handlers | Steps 1, 2 |
| 5 | `applyInvestmentsToDb` + integration tests | Steps 3, 4 |
| 6 | `syncInvestments` orchestrator + scheduler wiring + `snapshotHoldings` | Step 5 |
| 7 | Query layer (`queries/investments.ts`) + integration tests | Step 5 |
| 8 | Server action (`triggerInvestmentSync`) | Steps 6, 7 |
| 9 | Atoms (4 chart/badge components) | None |
| 10 | Molecules (4 row/header/filter components) | Step 9 |
| 11 | Organisms (3 — holdings table, transaction list, page layout) | Steps 10, 7 |
| 12 | Page + loading + error + sidebar nav | Steps 8, 11 |
| 13 | Dashboard widget + registry | Step 7 |

Backend-first (steps 1-8), then UI (steps 9-13). Each step is independently testable.

## Files Summary

### New Files (22)
- `src/lib/plaid/utils.ts`
- `src/lib/plaid/investments.ts`
- `src/lib/plaid/investments.test.ts`
- `src/queries/investments.ts`
- `src/actions/investments.ts`
- `src/app/(dashboard)/investments/page.tsx`
- `src/app/(dashboard)/investments/loading.tsx`
- `src/app/(dashboard)/investments/error.tsx`
- `src/components/atoms/portfolio-value-history-chart.tsx`
- `src/components/atoms/asset-allocation-chart.tsx`
- `src/components/atoms/holding-change-badge.tsx`
- `src/components/atoms/investment-type-badge.tsx`
- `src/components/molecules/portfolio-summary-header.tsx`
- `src/components/molecules/holding-row.tsx`
- `src/components/molecules/investment-transaction-row.tsx`
- `src/components/molecules/investment-filters.tsx`
- `src/components/organisms/holdings-table.tsx`
- `src/components/organisms/investment-transaction-list.tsx`
- `src/components/organisms/investment-page-layout.tsx`
- `src/components/organisms/widgets/investments-widget.tsx`
- `tests/integration/investment-sync.test.ts`
- `tests/integration/investment-queries.test.ts`

### Modified Files (7)
- `src/lib/plaid/sync.ts` — import shared utils from `utils.ts`
- `src/lib/plaid/schemas.ts` — add investment Zod schemas
- `src/lib/jobs/scheduler.ts` — add investment sync to 4h cron + daily snapshot job
- `src/components/organisms/sidebar-nav.tsx` — add Investments nav item
- `src/components/organisms/widgets/registry.ts` — register investments widget
- `src/queries/dashboard.ts` — add `getInvestmentsSummary()`
- `tests/mocks/handlers.ts` — add investment MSW mock handlers
