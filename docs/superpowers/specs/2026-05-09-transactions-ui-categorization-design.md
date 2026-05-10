# Phase 4 — Transactions UI + Categorization

The final MVP phase. Makes synced transaction data visible, reviewable, and categorizable. Optimized for a daily review workflow — compact, dense, inbox-style.

## Design Decisions

- **URL-driven filters.** Filters live in `searchParams`, not client state. Shareable URLs, back/forward works, clean server/client boundary.
- **Optimistic per-row mutations.** Category picker and reviewed toggle own their own state. No parent re-render cascade. Per-row actions skip `revalidatePath` (rely on optimistic state); only bulk actions call `router.refresh()`.
- **Pure categorization engine.** Business logic is a pure function (rules in, assignments out). DB interaction is a thin wrapper. Hooked into post-sync pipeline.
- **Inbox-style density.** 40px rows, 15+ visible at once. Unreviewed rows have a left-border accent. "Clearing the inbox" feel.
- **Transaction splits out of scope.** `transactionSplits` table exists in schema but split UI is not part of Phase 4. Category picker is disabled for transactions that have splits.

## Data Layer

### Transaction Queries — `src/queries/transactions.ts`

```typescript
interface TransactionFilters {
  dateFrom?: string;          // ISO date
  dateTo?: string;
  accountId?: string;
  categoryId?: string | null; // null = uncategorized, undefined = no filter
  reviewed?: boolean;
  search?: string;            // case-insensitive substring on name
}

interface TransactionPage {
  rows: TransactionRow[];
  nextCursor: string | null;
}

interface TransactionRow {
  id: string;
  date: string;
  name: string;
  originalName: string;
  amount: number;
  normalizedAmount: number;
  currency: string;
  pending: boolean;
  reviewed: boolean;
  accountId: string;
  accountName: string;
  merchantId: string | null;
  merchantName: string | null;
  merchantLogoUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryGroupName: string | null;
  categoryIcon: string | null;
  notes: string | null;
  hasSplits: boolean;
}
```

**`getTransactions(householdId, filters, limit?, cursor?, db?)`**

- Left-joins: categories, categoryGroups, merchants, accounts
- Uses `scopedQuery()` + `notDeleted()`
- Cursor-based keyset pagination: `WHERE (date, id) < (?, ?)` using SQLite row-value comparison (more index-friendly than `OR`)
- Cursor encoding: `Buffer.from(JSON.stringify({ date, id })).toString("base64")` — use Node.js `Buffer` API, not `btoa`. Malformed cursors reset to page 1 (try/catch around decode).
- Default page size: 50
- Order: `date DESC, id DESC`
- Filter: `categoryId: null` → `isNull(transactions.categoryId)`, `categoryId: undefined` → no filter
- Search: `LIKE '%term%'` (acceptable for 10K rows in SQLite; FTS5 is the upgrade path if performance degrades past 50K)
- `hasSplits`: subquery `EXISTS (SELECT 1 FROM transactionSplits WHERE transactionId = transactions.id)`

**`getTransactionById(householdId, transactionId, db?)`**

Same joins, returns single row or `undefined`. Used for action validation.

### Category Queries — `src/queries/categories.ts`

```typescript
interface CategoryOption {
  id: string;
  name: string;
  icon: string | null;
  isIncome: boolean;
  sortOrder: number;
}

interface CategoryGroup {
  id: string;
  name: string;
  icon: string | null;
  sortOrder: number;
  categories: CategoryOption[];
}
```

**`getCategories(householdId, db?)`** — Returns `CategoryGroup[]`. Fetches category groups + categories, groups in-memory. Same pattern as `getAccountsByInstitution`.

### Server Actions — `src/actions/transactions.ts`

All actions: `getHouseholdId()` internally (never accept `householdId` from client) → Zod validate → scoped ownership check (including `notDeleted()`) → update.

**Per-row actions do NOT call `revalidatePath`** — they rely on optimistic client state. This avoids the race condition where `revalidatePath` triggers a background re-render that overwrites the optimistic value before the action response arrives.

**Bulk actions call `revalidatePath("/transactions")`** — they change many rows, and the client does a full refresh anyway.

```typescript
updateTransactionCategory(transactionId, categoryId: string | null)
  → Sets categoryId. Sets reviewed=true when categoryId is non-null (manual categorization = reviewed).
  → Clearing category (null) does NOT change reviewed status.

toggleReviewed(transactionId)
  → Flips reviewed boolean. Returns { success: true, reviewed: boolean }.

bulkUpdateCategory(transactionIds[], categoryId: string | null)
  → Zod: z.array(z.string()).min(1).max(500). Exceeding 500 returns { error: "Too many items" }.
  → Ownership check via single SELECT with inArray + householdId + notDeleted().
  → Only operates on the intersection that belongs to the household. Returns { updatedCount }.

bulkMarkReviewed(transactionIds[], reviewed: boolean)
  → Same ownership + notDeleted() pattern. Returns { updatedCount }.

loadMoreTransactions(filters, cursor)
  → Server action wrapper around getTransactions for client-side "Load More".
  → Calls getHouseholdId() internally — householdId is NEVER a parameter.
```

### Categorization Engine — `src/lib/categorization/engine.ts`

**Pure function (no DB, no side effects):**

```typescript
interface CategorizableTransaction {
  id: string;
  name: string;
  merchantId: string | null;
  merchantName: string | null;    // from LEFT JOIN merchants
  merchantCategoryId: string | null; // from merchants.categoryId
}

interface CategoryRule {
  id: string;
  categoryId: string;
  matchField: "name" | "merchant";
  matchPattern: string;
  priority: number;
}

interface CategoryAssignment {
  transactionId: string;
  categoryId: string;
  source: "rule" | "merchant_default";
}

categorizeTransactions(
  transactions: CategorizableTransaction[],
  rules: CategoryRule[]
): CategoryAssignment[]
```

Algorithm:
1. For each transaction, iterate rules sorted by priority DESC
2. `matchField="name"` → case-insensitive substring match on `transaction.name`
3. `matchField="merchant"` → case-insensitive substring match on `transaction.merchantName` (requires join to merchants table in the DB-aware wrapper)
4. First rule match wins → `{ transactionId, categoryId, source: "rule" }`
5. No rule match + `transaction.merchantCategoryId` is not null → `{ source: "merchant_default" }`
6. No match at all → skip (stays uncategorized)

Not regex — plain substring matching. YAGNI.

**DB-aware wrapper:**

```typescript
categorizeSyncedTransactions(plaidItemId, householdId, db)
```

1. Fetch categoryRules for household (ordered by priority DESC) — 1 query
2. Fetch uncategorized (`categoryId IS NULL`), non-deleted transactions for this plaidItem's accounts, LEFT JOIN merchants to hydrate `merchantName` and `merchantCategoryId` — 1 query with join
3. Call `categorizeTransactions()` — pure, synchronous
4. Apply assignments in a single DB transaction — N updates batched

**Sync integration:** Called after `applyToDb()` in `syncInstitution()`, wrapped in try/catch. Categorization failure logs (with `plaidItemId` for debuggability) but never fails the sync. Only categorizes `categoryId IS NULL` transactions — never overwrites manual assignments.

### Sync Engine Fixes for Phase 4

**Modified transaction upsert must preserve `categoryId`/`reviewed`:** The existing `applyToDb` upsert for modified transactions does a full `UPDATE` that would silently clear manual categorization. Fix: in the upsert SET clause, preserve the existing `categoryId` and `reviewed` values. The upsert should only update Plaid-sourced fields (`name`, `amount`, `normalizedAmount`, `pending`, `date`, `merchantId`).

**Pending→posted must inherit category:** When a pending transaction becomes posted (detected via `pending_transaction_id`), the posted insert must copy `categoryId` and `reviewed` from the pending row before soft-deleting it. This preserves manual categorization done on pending transactions.

**Final `doSync` call sequence after all fixes:**
```
applyToDb(...)             // contains cursor update + status="active" reset
categorizeSyncedTransactions(...)  // try/catch, non-fatal, logs on error
return { success: true, ... }
```

### Plaid Category Data

`processBatch` computes `plaidCategory`/`plaidCategoryDetailed` from Plaid's `personal_finance_category` but the `transactions` schema has no columns for them — the data is silently dropped. Two options:

**Option chosen:** Remove the dead computation from `processBatch`. Plaid categories are not used by the categorization engine (which uses user-defined rules + merchant defaults). If needed later (Phase 12 LLM categorization), add the columns at that point. No dead code.

## Component Architecture

### Atomic Design Breakdown

```
src/components/
├── atoms/
│   └── amount-display.tsx            — pure display: color-coded amount (income=emerald, pending=opacity-60)
├── molecules/
│   ├── category-picker.tsx           — compact Select, owns optimistic state, calls server action
│   ├── reviewed-checkbox.tsx         — dot toggle (●/○), owns optimistic state, calls server action
│   ├── transaction-row.tsx           — dense h-10 row with group/row hover
│   ├── transaction-filters.tsx       — horizontal filter bar, pushes to URL searchParams
│   ├── transaction-empty-state.tsx   — context-aware (no data vs no filter match)
│   └── bulk-action-bar.tsx           — sticky bar for bulk categorize + mark reviewed
└── organisms/
    └── transaction-list.tsx          — list + selection Set<string> + load more + bulk actions
```

**Classification rationale:** Atoms are pure stateless display (`AmountDisplay` = props in, JSX out). Molecules own local state or trigger side effects (`CategoryPicker` owns optimistic state + calls server action; `TransactionFilters` composes primitives + manages URL). Organisms compose multiple molecules (`TransactionList` composes rows + bulk bar + empty state).

### Page Structure

```
src/app/(dashboard)/transactions/
├── page.tsx     — server component, reads searchParams, fetches data with await
├── loading.tsx  — 10-row skeleton grid matching real column widths
└── error.tsx    — error boundary with retry (matches accounts/error.tsx pattern)
```

### Visual Design — "Elevated Nova"

**Row density:** `h-10` (40px). 15+ rows visible in viewport.

**Grid columns:** `[checkbox 32px] [date 90px] [name 1fr] [account 140px] [category 160px] [amount 100px] [reviewed 40px]`

**Color coding:**
- Expense amounts: `text-foreground` (default — expenses are the norm)
- Income amounts: `text-emerald-600`
- Pending rows: `opacity-60` on entire row

**Unreviewed indicator:** `border-l-2 border-primary/40` on unreviewed rows. Creates a visual "todo queue." Reviewed rows have no border. The satisfaction of "clearing the inbox."

**Category picker:** Compact `h-7 text-xs` shadcn Select. "Uncategorized" shown in `text-muted-foreground italic`. Categories grouped by category group in the dropdown. Disabled with `isPending` via `useTransition` during in-flight action to prevent concurrent mutations. Disabled for transactions with splits (`hasSplits: true`).

**Reviewed toggle:** Small filled/unfilled dot (`●`/`○`) — more compact than a checkbox, matches status-badge pattern.

**Bulk action bar:** Appears below filters when `selected.size > 0`. Sticky with appropriate offset to avoid overlapping dashboard nav. Muted background, count badge. "Categorize" Select + "Mark Reviewed" button. Client-side cap enforcement: disable "Select All" when visible rows exceed 500.

**Filters:** Horizontal bar. Search input (magnifying glass, 300ms debounce), Account Select, Category Select (includes "Uncategorized" sentinel), date-from/date-to inputs, Reviewed switch. "Clear" ghost button when any filter active.

### State Management

**No state management library.** Everything is React built-ins:

- `TransactionFilters`: `useRouter` + `usePathname` for URL sync. `useState` for search debounce only.
- `TransactionList`: `useState(initialRows)`, `useState(cursor)`, `useState<Set<string>>(selected)`, `useState(refreshKey)`. `key={JSON.stringify(filters) + refreshKey}` auto-resets on filter change AND after bulk actions (increment `refreshKey` after bulk mutation + `router.refresh()`).
- `CategoryPicker`: `useState(currentCategoryId)` for optimistic update + `useTransition` for `isPending`. Reverts on action error.
- `ReviewedCheckbox`: `useState(reviewed)` for optimistic toggle. Reverts on action error.

**Data flow:**
```
URL searchParams → page.tsx (server, await) → getTransactions() → TransactionList (client)
  ↕ filter change → router.push() → server re-render (loading.tsx skeleton)
  ↕ load more → loadMoreTransactions() server action → append to client rows
  ↕ category/reviewed change → optimistic update + server action (no revalidatePath)
  ↕ bulk action → server action (revalidatePath) → router.refresh() + refreshKey++ → re-mount list
```

### Sidebar Nav Update

Add to `NAV_ITEMS` in `sidebar-nav.tsx`:
```typescript
{ href: "/transactions", label: "Transactions", icon: ArrowLeftRight }
```

## Pre-Phase 4 Refactoring

Five fixes applied before Phase 4 work begins:

1. **`src/actions/plaid.ts`** — Add `db: LedgrDb = defaultDb` param to `updateAccount`, scope the UPDATE with `scoped.where()`. Consistency with other actions + testability.

2. **`src/lib/money.ts`** — Remove `"depository"` from `FLIP_SIGN_TYPES`. Dead code — `"depository"` is a Plaid type, not an internal `AccountType`. Set should be `["checking", "savings", "other"]`.

3. **`src/lib/plaid/sync.ts`** — Move `plaidItems.status = "active"` reset inside `applyToDb`'s transaction (alongside cursor update).

4. **`src/lib/plaid/sync.ts`** — Modified transaction upsert: preserve existing `categoryId` and `reviewed` in the SET clause. Only update Plaid-sourced fields.

5. **`src/lib/plaid/sync.ts`** — Pending→posted transition: before soft-deleting the pending row, read its `categoryId` and `reviewed` values and copy them onto the posted insert.

6. **`src/actions/sync.ts`** — Add `revalidatePath("/transactions")` alongside the existing `revalidatePath("/accounts")`.

7. **`src/lib/plaid/sync.ts`** — Remove dead `plaidCategory`/`plaidCategoryDetailed` computation from `processBatch` (fields are computed but never persisted to schema).

## Testing

### Test Budget

| Layer | File | Count | What |
|-------|------|-------|------|
| Unit | `engine.test.ts` | 7-8 | Rule priority, name/merchant match, merchant fallback, no-match, empty rules, property tests (priority invariant, idempotency) |
| Unit | `amount-display.test.tsx` | 2-3 | Income green, expense default, pending opacity |
| Integration | `transaction-queries.test.ts` | 6-7 | Filter combos, cursor pagination, malformed cursor → page 1, household isolation, uncategorized filter, hasSplits |
| Integration | `transaction-actions.test.ts` | 6-7 | Category sets reviewed, category-to-null preserves reviewed, toggle flips, bulk cross-household isolation (dedicated), bulk exceeds 500 → error, bulk notDeleted filter |
| Integration | `categorization-sync.test.ts` | 5 | Post-sync categorization, priority, merchant fallback, failure doesn't fail sync, never overwrites manual assignment |

Total: ~28 tests. No E2E for MVP — integration tests cover critical paths.

### Property-Based Tests

`categorizeTransactions` is a pure function — ideal for `@fast-check/vitest`:
- **Priority invariant:** Given two rules matching the same transaction, higher priority always wins regardless of insertion order.
- **Idempotency:** `categorizeTransactions(txns, rules)` called twice with same inputs returns identical output.
- **No overcategorization:** Output length is always ≤ input transactions length.

Use `test.prop([arb])("name", fn)` API per CLAUDE.md convention.

### Test Helpers — `tests/integration/helpers.ts`

Shared test data factory chain (respects FK dependencies with `foreign_keys = ON`):

```typescript
insertHousehold(db) → { householdId }
insertAccount(db, householdId, overrides?) → { accountId }
insertTransaction(db, householdId, accountId, overrides?) → { transactionId }
insertCategoryRule(db, householdId, categoryId, overrides?) → { ruleId }
insertMerchant(db, householdId, overrides?) → { merchantId }
insertCategory(db, householdId, groupId, overrides?) → { categoryId }
insertCategoryGroup(db, householdId, overrides?) → { groupId }
```

Each factory returns the inserted ID. `insertTransaction` requires `accountId` (not optional) to make the FK dependency explicit.

Add one smoke test in `tests/integration/helpers.test.ts` that calls each factory and asserts the row is retrievable.

## Build Sequence

| Step | What | Depends On |
|------|------|------------|
| 0 | Pre-Phase 4 fixes (all 7 items above) | Nothing |
| 1 | Test helpers (`helpers.ts` + smoke test) | Step 0 |
| 2 | Categorization engine (pure function + unit tests + property tests) | Nothing |
| 3 | Transaction + category queries (+ integration tests) | Steps 0, 1 |
| 4 | Server actions (+ integration tests) | Steps 1, 3 |
| 5 | Sync integration (hook categorization into post-sync + integration tests) | Steps 2, 4 |
| 6 | Atoms (amount-display) | Nothing |
| 7 | Molecules (category-picker, reviewed-checkbox, transaction-row, filters, empty state, bulk bar) | Steps 4, 6 |
| 8 | Organisms (transaction-list) | Step 7 |
| 9 | Page wiring (page.tsx, loading.tsx, error.tsx, sidebar nav) + browser testing | Step 8 |

Steps 0 and 2 can run in parallel. Step 6 can run in parallel with Steps 3-5.
