# Phase 4 — Transactions UI + Categorization

The final MVP phase. Makes synced transaction data visible, reviewable, and categorizable. Optimized for a daily review workflow — compact, dense, inbox-style.

## Design Decisions

- **URL-driven filters.** Filters live in `searchParams`, not client state. Shareable URLs, back/forward works, clean server/client boundary.
- **Optimistic per-row mutations.** Category picker and reviewed toggle own their own state. No parent re-render cascade. Fire-and-forget server actions with revert-on-error.
- **Pure categorization engine.** Business logic is a pure function (rules in, assignments out). DB interaction is a thin wrapper. Hooked into post-sync pipeline.
- **Inbox-style density.** 40px rows, 15+ visible at once. Unreviewed rows have a left-border accent. "Clearing the inbox" feel.

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
}
```

**`getTransactions(householdId, filters, limit?, cursor?, db?)`**

- Left-joins: categories, categoryGroups, merchants, accounts
- Uses `scopedQuery()` + `notDeleted()`
- Cursor-based keyset pagination: `WHERE (date < ?) OR (date = ? AND id < ?)`
- Cursor encoding: `btoa(JSON.stringify({ date, id }))` — malformed cursors reset to page 1
- Default page size: 50
- Order: `date DESC, id DESC`
- Filter: `categoryId: null` → `isNull(transactions.categoryId)`, `categoryId: undefined` → no filter
- Search: `LIKE '%term%'` (acceptable for 10K rows in SQLite)

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

All actions: `getHouseholdId()` → Zod validate → scoped ownership check → update → `revalidatePath("/transactions")`.

```typescript
updateTransactionCategory(transactionId, categoryId: string | null)
  → Sets categoryId. Sets reviewed=true when categoryId is non-null (manual categorization = reviewed).
  → Clearing category (null) does NOT change reviewed status.

toggleReviewed(transactionId)
  → Flips reviewed boolean. Returns { success: true, reviewed: boolean }.

bulkUpdateCategory(transactionIds[], categoryId: string | null)
  → Ownership check via single SELECT with inArray + householdId.
  → Only operates on the intersection that belongs to the household.
  → Cap: 500 items per call.

bulkMarkReviewed(transactionIds[], reviewed: boolean)
  → Same ownership pattern. Returns { updatedCount }.

loadMoreTransactions(householdId, filters, cursor)
  → Server action wrapper around getTransactions for client-side "Load More".
```

### Categorization Engine — `src/lib/categorization/engine.ts`

**Pure function (no DB, no side effects):**

```typescript
categorizeTransactions(
  transactions: CategorizableTransaction[],
  rules: CategoryRule[]
): CategoryAssignment[]
```

Algorithm:
1. For each transaction, iterate rules sorted by priority DESC
2. `matchField="name"` → case-insensitive substring match on `transaction.name`
3. `matchField="merchant"` → case-insensitive substring match on `transaction.merchantName`
4. First rule match wins → `{ transactionId, categoryId, source: "rule" }`
5. No rule match + `merchant.categoryId` set → `{ source: "merchant_default" }`
6. No match at all → skip (stays uncategorized)

Not regex — plain substring matching. YAGNI.

**DB-aware wrapper:**

```typescript
categorizeSyncedTransactions(plaidItemId, householdId, db)
```

1. Fetch categoryRules for household (ordered by priority DESC)
2. Fetch uncategorized, non-deleted transactions for this plaidItem (via account join)
3. Call `categorizeTransactions()`
4. Apply assignments in a single DB transaction

**Sync integration:** Called after `applyToDb()` in `syncInstitution()`, wrapped in try/catch. Categorization failure logs but never fails the sync. Only categorizes `categoryId IS NULL` transactions — never overwrites manual assignments.

## Component Architecture

### Atomic Design Breakdown

```
src/components/
├── atoms/
│   ├── amount-display.tsx        — color-coded amount (income=emerald, pending=opacity-60)
│   ├── category-picker.tsx       — compact Select, optimistic update via server action
│   └── reviewed-checkbox.tsx     — dot toggle (●/○), optimistic update
├── molecules/
│   ├── transaction-row.tsx       — dense h-10 row with group/row hover
│   ├── transaction-empty-state.tsx — context-aware (no data vs no filter match)
│   └── bulk-action-bar.tsx       — sticky bar for bulk categorize + mark reviewed
└── organisms/
    ├── transaction-filters.tsx   — horizontal filter bar, pushes to URL searchParams
    └── transaction-list.tsx      — list + selection Set<string> + load more
```

### Page Structure

```
src/app/(dashboard)/transactions/
├── page.tsx     — server component, reads searchParams, fetches data
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

**Category picker:** Compact `h-7 text-xs` shadcn Select. "Uncategorized" shown in `text-muted-foreground italic`. Categories grouped by category group in the dropdown.

**Reviewed toggle:** Small filled/unfilled dot (`●`/`○`) — more compact than a checkbox, matches status-badge pattern.

**Bulk action bar:** Appears below filters when `selected.size > 0`. Sticky `top-0 z-10`, muted background, count badge. "Categorize" Select + "Mark Reviewed" button.

**Filters:** Horizontal bar. Search input (magnifying glass, 300ms debounce), Account Select, Category Select (includes "Uncategorized" sentinel), date-from/date-to inputs, Reviewed switch. "Clear" ghost button when any filter active.

### State Management

**No state management library.** Everything is React built-ins:

- `TransactionFilters`: `useRouter` + `usePathname` for URL sync. `useState` for search debounce only.
- `TransactionList`: `useState(initialRows)`, `useState(cursor)`, `useState<Set<string>>(selected)`. `key={JSON.stringify(filters)}` auto-resets on filter change.
- `CategoryPicker`: `useState(currentCategoryId)` for optimistic update. Reverts on action error.
- `ReviewedCheckbox`: `useState(reviewed)` for optimistic toggle. Reverts on action error.

**Data flow:**
```
URL searchParams → page.tsx (server) → getTransactions() → TransactionList (client)
  ↕ filter change → router.push() → server re-render
  ↕ load more → server action → append to client rows
  ↕ category/reviewed change → optimistic update + server action (fire-and-forget)
  ↕ bulk action → server action → router.refresh() → clear selection
```

### Sidebar Nav Update

Add to `NAV_ITEMS` in `sidebar-nav.tsx`:
```typescript
{ href: "/transactions", label: "Transactions", icon: ArrowLeftRight }
```

## Pre-Phase 4 Refactoring

Three fixes identified by code review, applied before Phase 4 work begins:

1. **`src/actions/plaid.ts`** — Add `db: LedgrDb = defaultDb` param to `updateAccount`, scope the UPDATE with `scoped.where()`. Consistency with other actions + testability.

2. **`src/lib/money.ts`** — Remove `"depository"` from `FLIP_SIGN_TYPES`. Dead code — `"depository"` is a Plaid type, not an internal `AccountType`. Set should be `["checking", "savings", "other"]`.

3. **`src/lib/plaid/sync.ts`** — Move `plaidItems.status = "active"` reset inside `applyToDb`'s transaction. Currently runs as a separate write after the transaction commits — crash between the two leaves stale status.

## Testing

### Test Budget

| Layer | File | Count | What |
|-------|------|-------|------|
| Unit | `engine.test.ts` | 5-6 | Rule priority, name/merchant match, merchant fallback, no-match, empty rules |
| Unit | `amount-display.test.tsx` | 2-3 | Income green, expense default, pending opacity |
| Integration | `transaction-queries.test.ts` | 5-6 | Filter combos, cursor pagination, household isolation, uncategorized filter |
| Integration | `transaction-actions.test.ts` | 4-5 | Category sets reviewed, toggle flips, bulk ownership isolation |
| Integration | `categorization-sync.test.ts` | 4 | Post-sync categorization, priority, merchant fallback, failure doesn't fail sync |

Total: ~22 tests. No E2E for MVP — integration tests cover critical paths.

### Test Helpers

Shared `tests/integration/helpers.ts` for test data factories:
- `insertTransaction(db, householdId, overrides)`
- `insertCategoryRule(db, householdId, overrides)`
- `insertMerchant(db, householdId, overrides)`

## Build Sequence

| Step | What | Depends On |
|------|------|------------|
| 0 | Pre-Phase 4 fixes (updateAccount db param, FLIP_SIGN_TYPES, status atomicity) | Nothing |
| 1 | Categorization engine (pure function + unit tests) | Nothing |
| 2 | Transaction + category queries (+ integration tests) | Step 0 |
| 3 | Server actions (+ integration tests) | Step 2 |
| 4 | Sync integration (hook categorization into post-sync + integration tests) | Steps 1, 3 |
| 5 | Atoms (amount-display, category-picker, reviewed-checkbox) | Step 3 |
| 6 | Molecules + Organisms (row, filters, list, bulk bar, empty state) | Step 5 |
| 7 | Page wiring (page.tsx, loading.tsx, error.tsx, sidebar nav) + browser testing | Step 6 |

Steps 0 and 1 can run in parallel. Steps 5-7 are UI-only and depend on the data layer being complete.
