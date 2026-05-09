# Phase 2 — Plaid Link + Token Exchange + Accounts Page

Design spec for Ledgr Phase 2. Covers Plaid client setup, Link flow, token exchange, accounts page (full), app shell, and pre-phase refactors.

## Pre-Phase Refactors

Three issues identified by code review that must be resolved before new Phase 2 code:

### 1. Token Encryption Wrapper

Create `src/lib/plaid/token.ts`:
- `encryptAccessToken(raw: string): string` — wraps `encrypt()` from `lib/encryption.ts`
- `decryptAccessToken(stored: string): string` — wraps `decrypt()`
- Single enforcement point for encrypted writes to `plaid_items.access_token`
- All code that reads or writes access tokens must use these wrappers exclusively

### 2. Extract `resolveHouseholdId`

Refactor `src/lib/auth/session.ts`:
- Extract the lookup-or-provision logic into `resolveHouseholdId(userId: string, db?: LedgrDb): string`
- `getHouseholdId()` becomes: `getSession()` → `resolveHouseholdId(session.user.id)`
- The extracted function is directly testable without Next.js `headers()`

### 3. Remove Duplicate Auth Guard

Refactor `src/app/(dashboard)/layout.tsx`:
- Remove the `if (!session) redirect("/login")` guard
- Keep the `getSession()` call for data composition (passing session to children)
- Middleware remains the single route protection layer

## Architecture

### Layer Structure

```
src/
├── lib/
│   ├── plaid/
│   │   ├── client.ts          # PlaidApi singleton
│   │   └── token.ts           # encryptAccessToken / decryptAccessToken
│   └── query-helpers.ts       # notDeleted() and other reusable query utilities
├── actions/
│   └── plaid.ts               # createLinkToken(), exchangePublicToken(), createManualAccount(), updateAccount()
├── queries/
│   └── accounts.ts            # getAccounts(), getAccountsByInstitution(), getAccountSummary()
├── components/
│   ├── ui/                    # shadcn primitives (existing)
│   ├── atoms/                 # BalanceDisplay, StatusBadge, AccountTypeIcon
│   ├── molecules/             # AccountCard, InstitutionHeader, SummaryCard
│   └── organisms/             # PlaidLinkFlow, AccountList, AccountsActions, EmptyStateCTA, AddManualAccountDialog, EditAccountDialog, SidebarNav
```

### Layer Rules

- **`queries/`** — read-only, always use `scopedQuery()`, return typed data. Called from Server Components.
- **`actions/`** — mutations, `"use server"` directive, always call `getHouseholdId()` at entry for auth consistency. Use `scopedQuery()` for ownership verification on updates/deletes. Call `revalidatePath()` after successful mutations. Called from Client Components.
- **`lib/plaid/`** — pure service logic, no Next.js imports. Accepts `db` and `householdId` as parameters for testability.
- **`lib/query-helpers.ts`** — reusable query predicates (`notDeleted`, etc.). Separate from `scoped-query.ts` which handles tenant isolation only.
- **Atoms** — no business logic, no data fetching. Pure presentation + props. Server-safe (no `"use client"`).
- **Molecules** — compose atoms, may accept callbacks. `"use client"` only if they use event handlers (e.g., `AccountCard` with `onEdit`).
- **Organisms** — may use hooks, call actions, manage state. Always `"use client"`.

### Dependency Direction

```
Page (Server Component) → queries/ → lib/plaid/ → Plaid SDK
                        → organisms → molecules → atoms
Client Components → actions/ → lib/plaid/ → Plaid SDK
```

No layer reaches "up" — organisms never import from pages, actions never import from components, lib never imports from actions or queries.

## Plaid Client

### `src/lib/plaid/client.ts`

Singleton `PlaidApi` instance:
- `basePath`: maps `PLAID_ENV` env var to `PlaidEnvironments.sandbox | .development | .production`
- Headers: `PLAID-CLIENT-ID` and `PLAID-SECRET` from env vars
- Throws on missing `PLAID_CLIENT_ID`, `PLAID_SECRET`, or invalid `PLAID_ENV` at initialization
- Exported as `plaidClient`

## Server Actions

### `actions/plaid.ts`

All actions use Zod for input validation at the boundary.

#### `createLinkToken()`

1. `getHouseholdId()` → verify authenticated + has household
2. `getSession()` → get `userId` for Plaid's `client_user_id`
3. Call `plaidClient.linkTokenCreate()`:
   - `user.client_user_id`: userId
   - `client_name`: "Ledgr"
   - `products`: `[Products.Transactions]`
   - `country_codes`: `[CountryCode.Us]`
   - `language`: "en"
   - `webhook`: `process.env.PLAID_WEBHOOK_URL` (included only if set — enables Phase 5 webhook delivery)
   - `redirect_uri`: `${process.env.NEXT_PUBLIC_APP_URL}/api/plaid/oauth-return` (required for OAuth institutions like Chase, Wells Fargo, BofA)
4. Return `{ linkToken: response.data.link_token }`
5. On error: return `{ error: "Failed to initialize bank connection" }`, log full Plaid error server-side

Note: Both `getHouseholdId()` and `getSession()` are `cache()`-wrapped, so calling both does not create a double DB round-trip within the same request.

#### OAuth Return Route

`/app/api/plaid/oauth-return/route.ts` — a simple page that re-initializes Plaid Link with `receivedRedirectUri` after OAuth bank redirects. Required for institutions that use OAuth (Chase, Wells Fargo, Bank of America, etc.). Without this, users at OAuth banks cannot complete the Link flow.

#### `exchangePublicToken(publicToken: string)`

1. `getHouseholdId()` → householdId (also verifies auth)
2. `plaidClient.itemPublicTokenExchange({ public_token: publicToken })` → accessToken, itemId
3. `plaidClient.itemGet({ access_token: accessToken })` → `item.institution_id`
4. `plaidClient.institutionsGetById({ institution_id, country_codes: [CountryCode.Us] })` → `institution.name`
5. **Duplicate check:** Query `plaid_items` WHERE `householdId` AND `plaidInstitutionId = institution_id`. If exists, return `{ error: "This institution is already connected" }`.
6. `plaidClient.accountsGet({ access_token: accessToken })` → accounts array
7. DB transaction (atomic):
   a. Insert `plaid_items`:
      - `id`: `crypto.randomUUID()`
      - `householdId`
      - `accessToken`: `encryptAccessToken(accessToken)`
      - `plaidInstitutionId`: from step 3
      - `institutionName`: from step 4
      - `status`: "active"
   b. For each Plaid account, insert `accounts`:
      - `id`: `crypto.randomUUID()`
      - `householdId`
      - `plaidItemId`: the item ID from step (a)
      - `plaidAccountId`: `account.account_id`
      - `name`, `officialName`
      - `type`: mapped from Plaid type (see Account Type Mapping below)
      - `subtype`: raw Plaid subtype
      - `currentBalance`: `plaidAmountToCents(account.balances.current)` (null → null, not zero — null means unknown)
      - `availableBalance`: `plaidAmountToCents(account.balances.available)` (null → null)
      - `creditLimit`: `plaidAmountToCents(account.balances.limit)` (null → null)
      - `currency`: `account.balances.iso_currency_code`
   c. For each account where `currentBalance` is not null, insert `balance_history` initial data point:
      - `id`: `crypto.randomUUID()`
      - `accountId`, `date`: today as `YYYY-MM-DD` ISO string (matches uniqueIndex), `balance`: currentBalance
8. `revalidatePath("/accounts")`
9. Return `{ success: true, accountCount: accounts.length }`
10. On error: transaction rolls back, return `{ error: "Failed to connect account" }`, log full error. If the error is `INSTITUTION_DOWN` or `INSTITUTION_NOT_RESPONDING`, return `{ error: "This bank is temporarily unavailable. Please try again later." }`.

**Balance sign convention note:** Plaid balances are always positive. For credit/loan accounts, `currentBalance` represents amount owed (a liability). This differs from the transaction sign convention where `normalizeAmount()` flips signs. Balance values are never sign-flipped — `getAccountSummary` handles the asset/liability distinction by account type, not by sign.

**Atomicity note:** If the DB transaction fails after the Plaid token exchange succeeds (step 2), the access token is lost — the user must re-run Link. This is acceptable for a side project. The alternative (insert a "pending" item before `accountsGet`, then update to "active") adds complexity for an edge case that requires both a successful Plaid API call and a DB failure.

#### Account Type Mapping

| Plaid type | Plaid subtype | Our type |
|-----------|--------------|----------|
| depository | checking | checking |
| depository | savings | savings |
| depository | (other) | checking |
| credit | * | credit |
| loan | * | loan |
| investment | * | investment |
| other | * | other |

#### `createManualAccount(data: { name: string, type: AccountType, balance: number })`

1. `getHouseholdId()` → householdId
2. Validate with Zod: `name` is non-empty string (max 100 chars), `type` is valid AccountType enum, `balance` is a safe integer (use `Math.round()` as defensive floor)
3. Insert `accounts`:
   - `id`: `crypto.randomUUID()`
   - `householdId`
   - `name`: data.name
   - `type`: data.type
   - `currentBalance`: data.balance (validated integer cents)
   - `isManual`: true
4. Insert `balance_history` initial data point (`id`: `crypto.randomUUID()`)
5. `revalidatePath("/accounts")`
6. Return `{ success: true, accountId }`

#### `updateAccount(accountId: string, data: { name?: string, isHidden?: boolean })`

1. `getHouseholdId()` → householdId
2. Verify ownership via `scopedQuery(householdId)`: select account WHERE id = accountId using scoped query
3. If not found: return `{ error: "Account not found" }`
4. Update only the provided fields
5. `revalidatePath("/accounts")`
6. Return `{ success: true }`

## Queries

### `queries/accounts.ts`

#### `getAccounts(householdId: string, db?)`

- All accounts WHERE `household_id = X` AND `deleted_at IS NULL` (using `notDeleted()` helper)
- Ordered by: type priority (checking → savings → credit → loan → investment → other), then name
- Returns full account row minus `deletedAt`

#### `getAccountsByInstitution(householdId: string, db?)`

- JOIN `accounts` with `plaid_items` on `plaid_item_id`
- Filter: `notDeleted(accounts)`
- Group by institution:
  ```typescript
  {
    institutionName: string
    plaidItemId: string | null
    status: "active" | "error" | "reauth_required" | null
    accounts: Account[]
  }[]
  ```
- Manual accounts (`plaidItemId = null`) grouped under `"Manual Accounts"`
- Each group includes connection status from `plaid_items.status`

#### `getAccountSummary(householdId: string, db?)`

- Aggregates from non-deleted, non-hidden accounts:
  - `totalAssets`: sum of `currentBalance` for checking + savings + investment (null balances excluded from sum via `COALESCE` or null-safe arithmetic)
  - `totalLiabilities`: sum of `currentBalance` for credit + loan (positive = amount owed)
  - `netWorth`: totalAssets - totalLiabilities
- All values in cents
- Balance sign convention: balances are always positive integers. Asset vs liability is determined by account type, not sign. This differs from transaction amounts where `normalizeAmount()` flips signs.

### Soft-Delete Helper

Add `notDeleted(table)` to `src/lib/query-helpers.ts` (NOT `scoped-query.ts` — keep tenant isolation and query predicates as separate concerns):
```typescript
notDeleted(table: { deletedAt: SQLiteColumn }) → isNull(table.deletedAt)
```
Composed with `scopedQuery().where()` in all queries against `accounts` and later `transactions`.

### `plaidAmountToCents` Null Handling

Update `plaidAmountToCents` in `src/lib/money.ts` to handle null:
```typescript
function plaidAmountToCents(amount: number | null): number | null {
  if (amount === null || amount === undefined) return null;
  return Math.round(amount * 100);
}
```
Null means "unknown" — different from zero. Credit cards with no statement yet, investment accounts during market close, and pending accounts all return null balances from Plaid.

## UI Components

### Aesthetic Direction

Refined minimal — clean, spacious, subtle borders and shadows. Linear/Mercury-inspired. Uses the existing shadcn warm-slate palette with oklch color tokens from `globals.css`. No decoration for decoration's sake.

### Atoms

All atoms are server-safe (no `"use client"`). Pure presentation.

**`BalanceDisplay`** (`components/atoms/balance-display.tsx`)
- Props: `amount: number | null` (cents), `currency?: string`, `size?: "sm" | "md" | "lg"`
- Renders formatted currency via `centsToDisplay()`
- Null amount renders as "—" (em dash) to indicate unknown
- Negative amounts in muted red

**`StatusBadge`** (`components/atoms/status-badge.tsx`)
- Props: `status: "active" | "error" | "reauth_required"`
- Active: subtle green dot + "Connected"
- Error: amber dot + "Error"
- Reauth: red dot + "Reconnect needed"
- Uses shadcn Badge styling
- Accessibility: text label is the primary indicator, colored dot is supplementary (WCAG 1.4.1)

**`AccountTypeIcon`** (`components/atoms/account-type-icon.tsx`)
- Props: `type: AccountType`, `className?`
- Maps type → lucide-react icon (Building2, PiggyBank, CreditCard, Receipt, TrendingUp, CircleDot)

### Molecules

**`AccountCard`** (`components/molecules/account-card.tsx`) — `"use client"`
- Props: account data + `onEdit` callback
- Layout: AccountTypeIcon + name + mask (last 4) left, BalanceDisplay right
- OfficialName as subtitle when different from name
- Edit action visible on hover AND focus-within (keyboard accessible: `hover:visible focus-within:visible`)
- Clean horizontal layout, generous padding

**`InstitutionHeader`** (`components/molecules/institution-header.tsx`)
- Props: `institutionName`, `status`, `accountCount`
- Layout: institution name as `<h3>` heading (semantic, screen reader navigable) left, StatusBadge right, account count subtitle
- Visual separator between groups

**`SummaryCard`** (`components/molecules/summary-card.tsx`)
- Props: `label`, `amount` (cents, nullable), `currency?`
- Large BalanceDisplay, small label below
- Used for "Net Worth", "Assets", "Liabilities"

### Organisms

All organisms are `"use client"`.

**`EmptyStateCTA`** (`components/organisms/empty-state-cta.tsx`) — `"use client"`
- Icon composition or simple SVG illustration
- Headline: "Connect Your Bank"
- Subtitle: explains what Plaid does, privacy assurance
- Contains the PlaidLinkFlow organism as its CTA button
- Centered on page, generous whitespace
- Note: this is an organism (not molecule) because it contains PlaidLinkFlow, which is itself an organism with state and actions

**`PlaidLinkFlow`** (`components/organisms/plaid-link-flow.tsx`) — `"use client"`
- Manages full Plaid Link lifecycle with **lazy token fetch** (not on mount):
  1. Renders a trigger button (text varies by context: "Connect Bank" vs "+ Add Account")
  2. On trigger click: show loading spinner on button, call `createLinkToken()` server action
  3. Once token received, pass to `usePlaidLink()` hook and call `open()` immediately
  4. On `onSuccess` callback: show loading state, call `exchangePublicToken(publicToken)` server action
  5. On `onExit` callback: handle user abort vs Plaid error — if error, show inline message with retry; if user-initiated exit, no error shown
  6. Focus management: attach `ref` to trigger button, call `triggerRef.current?.focus()` in both `onSuccess` and `onExit` callbacks after modal closes
- Link token expiry is not a concern because tokens are fetched fresh on each click (lazy fetch pattern)
- No `router.refresh()` needed — `revalidatePath` in the server action handles cache invalidation

**`AccountList`** (`components/organisms/account-list.tsx`) — `"use client"`
- Props: `institutionGroups` from `getAccountsByInstitution()`
- Maps over groups → InstitutionHeader + AccountCard[] per group
- Manual accounts group at the bottom
- Manages edit dialog state (`selectedAccount: Account | null`)
- Renders `EditAccountDialog` controlled by `selectedAccount` state

**`AccountsActions`** (`components/organisms/accounts-actions.tsx`) — `"use client"`
- Wrapper organism for the "+ Add Account" dropdown in the page header
- Owns state for `AddManualAccountDialog` (`dialogOpen: boolean`)
- Renders:
  - `DropdownMenu` with two items: "Connect Bank" and "Add Manual Account"
  - "Connect Bank" item triggers `PlaidLinkFlow` (manages its own Link state)
  - "Add Manual Account" item sets `dialogOpen = true`
  - `AddManualAccountDialog` controlled by `dialogOpen`

**`AddManualAccountDialog`** (`components/organisms/add-manual-account-dialog.tsx`) — `"use client"`
- shadcn Dialog, controlled by parent (`open` + `onOpenChange` props)
- Form: name input, type select dropdown, balance input (formatted currency — user enters dollars, converted to cents on submit via `displayToCents()`)
- Zod validation on submit before calling server action
- Calls `createManualAccount()` server action on submit
- Loading + error states

**`EditAccountDialog`** (`components/organisms/edit-account-dialog.tsx`) — `"use client"`
- shadcn Dialog, controlled by `AccountList` (`open` when `selectedAccount !== null`)
- Fields: name (text input), hidden toggle (switch)
- Calls `updateAccount()` server action

**`SidebarNav`** (`components/organisms/sidebar-nav.tsx`) — `"use client"`
- Uses shadcn `Sidebar` component (variant: `sidebar` — fixed, not floating)
- Layout: flexbox, sidebar left + content area right
- Width: 240px desktop, collapsible to icon-only (56px) via toggle button
- Mobile: collapses to a sheet/drawer triggered by hamburger menu (shadcn `Sheet`)
- Content:
  - Top: Ledgr wordmark (collapsed: "L" icon)
  - Middle: nav links with icons — Dashboard (`LayoutDashboard`), Accounts (`Building2`). Active link detected via `usePathname()`, styled with `bg-sidebar-accent` token
  - Bottom: user menu — user name/email, "Sign Out" button (calls `authClient.signOut()`, redirects to `/login`)
- Follows shadcn sidebar tokens already defined in `globals.css` (`--sidebar-*`)

### Page Layout

**`/app/(dashboard)/accounts/page.tsx`** — Server Component

1. `getHouseholdId()` → householdId
2. Parallel fetch: `getAccountsByInstitution(householdId)` + `getAccountSummary(householdId)`
3. If no accounts → render EmptyStateCTA
4. If accounts exist:

```
┌─────────────────────────────────────────────┐
│  Accounts                    [+ Add Account]│
├─────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ Net Worth│ │  Assets  │ │  Debts   │    │
│  │ $12,450  │ │ $15,200  │ │ $2,750   │    │
│  └──────────┘ └──────────┘ └──────────┘    │
├─────────────────────────────────────────────┤
│  Chase                        ● Connected   │
│  ┌─────────────────────────────────────┐    │
│  │ 🏦 Checking ···4521     $3,245.00  │    │
│  │ 🐷 Savings ···8832      $11,200.00 │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  Manual Accounts                            │
│  ┌─────────────────────────────────────┐    │
│  │ 💳 Cash                  $755.00   │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

The `AccountsActions` organism in the page header owns the "+ Add Account" dropdown and both action paths (Plaid Link and manual account dialog).

**`/app/(dashboard)/accounts/loading.tsx`** — Loading State

Skeleton UI matching the page layout:
- 3 skeleton rectangles for SummaryCards
- 2-3 skeleton card rows for account groups
- Prevents layout shift on data load

**`/app/(dashboard)/accounts/error.tsx`** — Error Boundary

`"use client"` error boundary:
- Friendly error message ("Something went wrong loading your accounts")
- Retry button using `reset()` from error boundary props
- Handles DB errors, network failures gracefully

### Dashboard Layout Update

`src/app/(dashboard)/layout.tsx` updated to include `SidebarNav`:
- Flex layout: `SidebarNav` (left) + `<main>` content area (right)
- `SidebarNav` receives session data from `getSession()` in the layout (server → client prop)
- Content area has consistent padding and max-width

## Dependencies

### New Packages

- `react-plaid-link` — React hook for Plaid Link. Install via `pnpm add react-plaid-link`.

### Existing (already installed)

- `plaid` v42 — Node SDK
- `lucide-react` — icons (shadcn dependency)
- All shadcn, Drizzle, Better Auth dependencies

### New shadcn Components to Add

- `dialog` — for AddManualAccountDialog, EditAccountDialog
- `select` — for account type dropdown
- `badge` — for StatusBadge
- `dropdown-menu` — for AccountsActions split action
- `switch` — for hidden toggle in EditAccountDialog
- `separator` — for visual dividers between institution groups
- `sidebar` — for SidebarNav
- `sheet` — for mobile sidebar drawer
- `skeleton` — for loading.tsx

### New Environment Variables

Add to `.env.example`:
- `NEXT_PUBLIC_APP_URL=http://localhost:3000` — used for OAuth redirect URI

## Testing

### Unit Tests (colocated)

**`lib/plaid/client.test.ts`**
- Throws if `PLAID_CLIENT_ID` or `PLAID_SECRET` missing
- Throws if `PLAID_ENV` is invalid
- Maps `PLAID_ENV` correctly to PlaidEnvironments

**`lib/plaid/token.test.ts`**
- Round-trip: `decryptAccessToken(encryptAccessToken(token))` === original
- Different inputs produce different ciphertexts

**`lib/money.test.ts`** (extend existing)
- `plaidAmountToCents(null)` returns `null`
- `plaidAmountToCents(undefined)` returns `null`
- `plaidAmountToCents(0)` returns `0` (not null)

### Integration Tests (`tests/integration/`)

**`tests/integration/plaid-exchange.test.ts`**
- Happy path: exchange → plaid_items row with encrypted token + accounts with correct cent balances + household_id
- Household isolation: exchange as household A, query as household B → zero results
- Account type mapping: depository/checking → "checking", depository/savings → "savings", credit → "credit"
- Atomicity: if account insert fails, plaid_items row also rolled back
- Decrypt round-trip: stored access token decrypts to original
- Null balance handling: null Plaid balances stored as null, not zero
- Duplicate institution guard: second exchange for same institution returns error

**`tests/integration/accounts-queries.test.ts`**
- `getAccounts` returns only non-deleted accounts for given household
- `getAccountsByInstitution` groups correctly — Plaid under institution, manual under "Manual"
- `getAccountSummary` — assets minus liabilities = net worth, null balances excluded from sums
- Soft-deleted accounts excluded from all queries
- `notDeleted` helper composes with `scopedQuery`

### E2E Tests (`e2e/`)

**`e2e/accounts.spec.ts`**
- Empty state: new user sees "Connect Your Bank" CTA
- Manual account: create via dialog, appears in list with correct balance
- Full Plaid Link E2E: `test.skip` — requires sandbox credentials, include local testing instructions

### MSW Handler Updates (`tests/mocks/handlers.ts`)

Extend existing stubs:
- `POST /item/public_token/exchange` — returns `{ access_token, item_id }`
- `POST /item/get` — returns `{ item: { institution_id } }`
- `POST /institutions/get_by_id` — returns `{ institution: { name, institution_id } }`
- `POST /accounts/get` — extend with multiple account types:
  - Checking account: `{ current: 1000.0, available: 900.0, limit: null }`
  - Savings account: `{ current: 5000.0, available: 5000.0, limit: null }`
  - Credit card: `{ current: 450.50, available: 549.50, limit: 1000.00 }`
  - Account with null balances: `{ current: null, available: null, limit: null }` (tests null handling)

### Not Tested

- Plaid Link UI rendering (Plaid's code)
- shadcn component internals
- Schema definitions (declarative)
- Plaid SDK transport layer

## Deferred (Not Phase 2)

- **Consent expiration handling** — `PENDING_EXPIRATION` webhook (Phase 5)
- **Rate limiting** on Plaid API calls (production hardening)
- **Institution logos** — available from `institutionsGetById` but requires CDN/storage decision
- **`investments` product** in link token — needed for holdings sync (Phase 11)
- **Optimistic updates** — `useOptimistic` for instant UI feedback on mutations (future enhancement)
- **`plaid_account_id` unique index** — prevents duplicate accounts on re-link edge case, worth adding but not blocking
