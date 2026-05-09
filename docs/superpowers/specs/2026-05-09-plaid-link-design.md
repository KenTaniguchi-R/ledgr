# Phase 2 — Plaid Link + Token Exchange + Accounts Page

Design spec for Ledgr Phase 2. Covers Plaid client setup, Link flow, token exchange, accounts page (full), and pre-phase refactors.

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
│   └── plaid/
│       ├── client.ts          # PlaidApi singleton
│       └── token.ts           # encryptAccessToken / decryptAccessToken
├── actions/
│   └── plaid.ts               # createLinkToken(), exchangePublicToken(), createManualAccount(), updateAccount()
├── queries/
│   └── accounts.ts            # getAccounts(), getAccountsByInstitution(), getAccountSummary()
├── components/
│   ├── ui/                    # shadcn primitives (existing)
│   ├── atoms/                 # BalanceDisplay, StatusBadge, AccountTypeIcon
│   ├── molecules/             # AccountCard, InstitutionHeader, SummaryCard, EmptyStateCTA
│   └── organisms/             # PlaidLinkFlow, AccountList, AddManualAccountDialog, EditAccountDialog
```

### Layer Rules

- **`queries/`** — read-only, always use `scopedQuery()`, return typed data. Called from Server Components.
- **`actions/`** — mutations, `"use server"` directive, always call `getHouseholdId()` at entry. Called from Client Components.
- **`lib/plaid/`** — pure service logic, no Next.js imports. Accepts `db` and `householdId` as parameters for testability.
- **Atoms** — no business logic, no data fetching. Pure presentation + props.
- **Molecules** — compose atoms, may accept callbacks, no data fetching.
- **Organisms** — may use hooks, call actions, manage state. `"use client"` boundary.

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
- Throws on missing credentials at initialization
- Exported as `plaidClient`

## Server Actions

### `actions/plaid.ts`

#### `createLinkToken()`

1. `getSession()` → get `userId`
2. Call `plaidClient.linkTokenCreate()`:
   - `user.client_user_id`: userId
   - `client_name`: "Ledgr"
   - `products`: `[Products.Transactions]`
   - `country_codes`: `[CountryCode.Us]`
   - `language`: "en"
3. Return `{ linkToken: response.data.link_token }`
4. On error: return `{ error: "Failed to initialize bank connection" }`, log full Plaid error server-side

#### `exchangePublicToken(publicToken: string)`

1. `getSession()` → userId
2. `getHouseholdId()` → householdId
3. `plaidClient.itemPublicTokenExchange({ public_token: publicToken })` → accessToken, itemId
4. `plaidClient.accountsGet({ access_token: accessToken })` → accounts array
5. DB transaction (atomic):
   a. Insert `plaid_items`:
      - `id`: `crypto.randomUUID()`
      - `householdId`
      - `accessToken`: `encryptAccessToken(accessToken)`
      - `plaidInstitutionId`, `institutionName` from item metadata
      - `status`: "active"
   b. For each Plaid account, insert `accounts`:
      - `id`: `crypto.randomUUID()`
      - `householdId`
      - `plaidItemId`: the item ID from step (a)
      - `plaidAccountId`: `account.account_id`
      - `name`, `officialName`
      - `type`: mapped from Plaid type (see Account Type Mapping below)
      - `subtype`: raw Plaid subtype
      - `currentBalance`: `plaidAmountToCents(account.balances.current)` (null → 0)
      - `availableBalance`: `plaidAmountToCents(account.balances.available)` (null → 0)
      - `creditLimit`: `plaidAmountToCents(account.balances.limit)` (null → null)
      - `currency`: `account.balances.iso_currency_code`
   c. For each account, insert `balance_history` initial data point:
      - `accountId`, `date`: today as `YYYY-MM-DD` ISO string (matches uniqueIndex), `balance`: currentBalance
6. Return `{ success: true, accountCount: accounts.length }`
7. On error: transaction rolls back, return `{ error: "Failed to connect account" }`, log full error

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
2. Insert `accounts`:
   - `id`: `crypto.randomUUID()`
   - `householdId`
   - `name`: data.name
   - `type`: data.type
   - `currentBalance`: data.balance (already in cents from UI)
   - `isManual`: true
3. Insert `balance_history` initial data point
4. Return `{ success: true, accountId }`

#### `updateAccount(accountId: string, data: { name?: string, isHidden?: boolean })`

1. `getHouseholdId()` → householdId
2. Verify ownership: select account WHERE id = accountId AND household_id = householdId
3. If not found: return `{ error: "Account not found" }`
4. Update only the provided fields
5. Return `{ success: true }`

## Queries

### `queries/accounts.ts`

#### `getAccounts(householdId: string, db?)`

- All accounts WHERE `household_id = X` AND `deleted_at IS NULL`
- Ordered by: type priority (checking → savings → credit → loan → investment → other), then name
- Returns full account row minus `deletedAt`

#### `getAccountsByInstitution(householdId: string, db?)`

- JOIN `accounts` with `plaid_items` on `plaid_item_id`
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
  - `totalAssets`: sum of `currentBalance` for checking + savings + investment
  - `totalLiabilities`: sum of `currentBalance` for credit + loan (stored as positive = amount owed)
  - `netWorth`: totalAssets - totalLiabilities
- All values in cents

### Soft-Delete Helper

Add `notDeleted(table)` to `src/lib/scoped-query.ts`:
```typescript
notDeleted(table: { deletedAt: SQLiteColumn }) → isNull(table.deletedAt)
```
Composed with `scopedQuery().where()` in all queries against `accounts` and later `transactions`.

## UI Components

### Aesthetic Direction

Refined minimal — clean, spacious, subtle borders and shadows. Linear/Mercury-inspired. Uses the existing shadcn warm-slate palette with oklch color tokens from `globals.css`. No decoration for decoration's sake.

### Atoms

**`BalanceDisplay`** (`components/atoms/balance-display.tsx`)
- Props: `amount: number` (cents), `currency?: string`, `size?: "sm" | "md" | "lg"`
- Renders formatted currency via `centsToDisplay()`
- Negative amounts in muted red

**`StatusBadge`** (`components/atoms/status-badge.tsx`)
- Props: `status: "active" | "error" | "reauth_required"`
- Active: subtle green dot + "Connected"
- Error: amber dot + "Error"
- Reauth: red dot + "Reconnect needed"
- Uses shadcn Badge styling

**`AccountTypeIcon`** (`components/atoms/account-type-icon.tsx`)
- Props: `type: AccountType`, `className?`
- Maps type → lucide-react icon (Building2, PiggyBank, CreditCard, Receipt, TrendingUp, CircleDot)

### Molecules

**`AccountCard`** (`components/molecules/account-card.tsx`)
- Props: account data + `onEdit` callback
- Layout: AccountTypeIcon + name + mask (last 4) left, BalanceDisplay right
- OfficialName as subtitle when different from name
- Hover state reveals edit action
- Clean horizontal layout, generous padding

**`InstitutionHeader`** (`components/molecules/institution-header.tsx`)
- Props: `institutionName`, `status`, `accountCount`
- Layout: institution name left, StatusBadge right, account count subtitle
- Visual separator between groups

**`SummaryCard`** (`components/molecules/summary-card.tsx`)
- Props: `label`, `amount` (cents), `currency?`
- Large BalanceDisplay, small label below
- Used for "Net Worth", "Assets", "Liabilities"

**`EmptyStateCTA`** (`components/molecules/empty-state-cta.tsx`)
- Icon composition or simple SVG illustration
- Headline: "Connect Your Bank"
- Subtitle: explains what Plaid does, privacy assurance
- Contains the PlaidLinkFlow organism as its CTA button
- Centered on page, generous whitespace

### Organisms

**`PlaidLinkFlow`** (`components/organisms/plaid-link-flow.tsx`)
- `"use client"` — manages full Plaid Link lifecycle
- On mount: calls `createLinkToken()` server action
- Passes token to `usePlaidLink()` hook from `react-plaid-link`
- Renders a trigger button (text varies by context: "Connect Bank" vs "+ Add Account")
- On success callback: calls `exchangePublicToken(publicToken)` server action
- Shows loading states during token creation and exchange
- On error: inline error message with retry option
- On completion: `router.refresh()` to re-render Server Component parent

**`AccountList`** (`components/organisms/account-list.tsx`)
- Props: `institutionGroups` from `getAccountsByInstitution()`
- Maps over groups → InstitutionHeader + AccountCard[] per group
- Manual accounts group at the bottom
- Manages edit dialog state (which account is being edited)

**`AddManualAccountDialog`** (`components/organisms/add-manual-account-dialog.tsx`)
- shadcn Dialog
- Form: name input, type select dropdown, balance input (formatted currency — user enters dollars, converted to cents on submit)
- Calls `createManualAccount()` server action on submit
- `router.refresh()` on success
- Loading + error states

**`EditAccountDialog`** (`components/organisms/edit-account-dialog.tsx`)
- shadcn Dialog, opened from AccountCard edit action
- Fields: name (text input), hidden toggle (switch)
- Calls `updateAccount()` server action
- `router.refresh()` on success

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

The "+ Add Account" button opens a dropdown with two options: "Connect Bank" (triggers PlaidLinkFlow) and "Add Manual Account" (opens AddManualAccountDialog).

### App Shell

Phase 2 also introduces a basic sidebar nav in the dashboard layout, since accounts is the first real page beyond the stub. Minimal: Ledgr logo/wordmark at top, nav links (Dashboard, Accounts — more added in later phases), user menu at bottom (name, sign out). The sidebar follows shadcn sidebar tokens already defined in `globals.css`.

## Dependencies

### New Package

- `react-plaid-link` — React hook for Plaid Link. Install via `pnpm add react-plaid-link`.

### Existing (already installed)

- `plaid` v42 — Node SDK
- `lucide-react` — icons (shadcn dependency)
- All shadcn, Drizzle, Better Auth dependencies

### New shadcn Components to Add

- `dialog` — for AddManualAccountDialog, EditAccountDialog
- `select` — for account type dropdown
- `badge` — for StatusBadge
- `dropdown-menu` — for "+ Add Account" split action
- `switch` — for hidden toggle in EditAccountDialog
- `separator` — for visual dividers between institution groups

## Testing

### Unit Tests (colocated)

**`lib/plaid/client.test.ts`**
- Throws if `PLAID_CLIENT_ID` or `PLAID_SECRET` missing
- Maps `PLAID_ENV` correctly to PlaidEnvironments

**`lib/plaid/token.test.ts`**
- Round-trip: `decryptAccessToken(encryptAccessToken(token))` === original
- Different inputs produce different ciphertexts

### Integration Tests (`tests/integration/`)

**`tests/integration/plaid-exchange.test.ts`**
- Happy path: exchange → plaid_items row with encrypted token + accounts with correct cent balances + household_id
- Household isolation: exchange as household A, query as household B → zero results
- Account type mapping: depository/checking → "checking", depository/savings → "savings", credit → "credit"
- Atomicity: if account insert fails, plaid_items row also rolled back
- Decrypt round-trip: stored access token decrypts to original

**`tests/integration/accounts-queries.test.ts`**
- `getAccounts` returns only non-deleted accounts for given household
- `getAccountsByInstitution` groups correctly — Plaid under institution, manual under "Manual"
- `getAccountSummary` — assets minus liabilities = net worth
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
- `POST /accounts/get` — extend with multiple account types (checking, savings, credit)
- `POST /institutions/get_by_id` — returns institution name

### Not Tested

- Plaid Link UI rendering (Plaid's code)
- shadcn component internals
- Schema definitions (declarative)
- Plaid SDK transport layer
