# Ledgr — Design Spec

A self-hostable, open-source personal finance app. Own your financial data — no subscriptions, no ads, no data harvesting. Track accounts, transactions, budgets, investments, net worth, and goals — all in one place.

**License:** AGPLv3 (prevents closed-source forks while keeping it fully open-source)

## Stack

| Layer | Choice | Version |
|-------|--------|---------|
| Framework | Next.js (App Router) | 16.2 |
| Language | TypeScript | 6.0 |
| UI | shadcn/ui + Tailwind CSS | v4.6 / v4 |
| Charts | Recharts (via shadcn Chart) | v3 |
| ORM | Drizzle ORM | 0.45 |
| Database | SQLite (WAL mode) | — |
| Auth | Better Auth | latest |
| Bank Sync | Plaid Node SDK | latest |
| Data Import | CSV/OFX parser | custom |
| AI | Vercel AI SDK (BYOK) | v6 |
| Background Jobs | node-cron | latest |
| Containerization | Docker + docker-compose | — |
| Testing | Vitest + Playwright | latest |

## Architecture

```
Browser ──▶ Next.js App Router
              ├── Server Components ── read-only data (transactions, reports, dashboard)
              ├── Server Actions ──── mutations (sync, categorize, budget CRUD)
              ├── API Routes ──────── Plaid webhooks, AI streaming endpoints
              └── Client Components ── interactive UI (charts, forms, drag-and-drop)
                    │
              Drizzle ORM ──▶ SQLite (single file, WAL mode)
              Plaid Node SDK ──▶ Plaid API (sandbox/production via PLAID_ENV)
              Vercel AI SDK ──▶ User's LLM provider (Claude/OpenAI/Gemini)
```

### Key Architecture Decisions

- **No separate backend.** Next.js handles everything via Server Components (reads), Server Actions (writes), and API routes (webhooks, streaming).
- **SQLite single file.** Zero-config, portable, easy backup (copy the file). WAL mode enabled with `busy_timeout=5000` for household concurrency. **Explicitly not serverless** — SQLite requires a persistent filesystem. Supported deployment targets: Docker on VPS, bare metal, or local machine.
- **All monetary amounts stored as INTEGER (cents).** $12.50 → 1250. Prevents IEEE 754 floating-point rounding errors in financial aggregations. Converted to display format at the UI layer.
- **Server Components for data-heavy pages.** Transaction lists, reports, net worth charts — zero client JS for read-only views.
- **Client Components only for interactivity.** Dashboard widgets, chart interactions, forms, drag-and-drop.
- **Ownership enforcement via query wrapper.** A `scopedQuery(householdId)` wrapper auto-injects `household_id` filtering on all queries — not manual `assertOwnership()` calls. This prevents data leaks from a missed WHERE clause. SQLite has no RLS, so this is enforced at the application layer.
- **Encryption at app layer.** Plaid access tokens and AI API keys encrypted with aes-256-gcm, key from `ENCRYPTION_KEY` env var.
- **Background jobs via node-cron.** Plaid sync polling, AI batch categorization, daily balance snapshots, and recurring transaction updates run on a schedule. Not reliant on Vercel cron or external schedulers.
- **Plaid is the primary feature.** Bank sync via Plaid is the core experience. CSV/OFX import is available as a supplementary option for accounts not supported by Plaid.
- **Demo mode on first boot.** If no accounts exist, offer to load sample data so users can explore the dashboard before configuring anything. Critical for adoption.
- **Better Auth adapter interface.** Pin Better Auth version and wrap auth calls behind an adapter so the auth provider is swappable if Better Auth stalls.

## Data Model

### Households & Users

```
households
  id              TEXT PRIMARY KEY
  name            TEXT NOT NULL
  created_at      DATETIME
  updated_at      DATETIME

household_members
  id              TEXT PRIMARY KEY
  household_id    TEXT FK → households
  user_id         TEXT FK → users (Better Auth)
  role            TEXT CHECK (owner, member, advisor)
  created_at      DATETIME
  UNIQUE(household_id, user_id)

user_settings
  id              TEXT PRIMARY KEY
  user_id         TEXT FK → users
  theme           TEXT DEFAULT 'system'
  currency        TEXT DEFAULT 'USD'
  ai_provider     TEXT (openai, anthropic, google)
  ai_model        TEXT
  ai_api_key      TEXT (encrypted)
  dashboard_layout TEXT (JSON: widget positions and config)
  created_at      DATETIME
  updated_at      DATETIME
```

### Plaid Integration

```
plaid_items
  id                  TEXT PRIMARY KEY
  household_id        TEXT FK → households
  access_token        TEXT NOT NULL (encrypted)
  plaid_institution_id TEXT
  institution_name    TEXT
  sync_cursor         TEXT
  status              TEXT DEFAULT 'active' CHECK (active, error, reauth_required)
  error_code          TEXT
  created_at          DATETIME
  updated_at          DATETIME

sync_log
  id              TEXT PRIMARY KEY
  plaid_item_id   TEXT FK → plaid_items
  synced_at       DATETIME
  cursor_before   TEXT
  cursor_after    TEXT
  added_count     INTEGER
  modified_count  INTEGER
  removed_count   INTEGER
  error           TEXT
```

### Accounts

```
accounts
  id                  TEXT PRIMARY KEY
  household_id        TEXT FK → households
  plaid_item_id       TEXT FK → plaid_items (nullable for manual)
  plaid_account_id    TEXT (Plaid's stable account ID)
  name                TEXT NOT NULL
  official_name       TEXT
  type                TEXT CHECK (checking, savings, credit, loan, investment, other)
  subtype             TEXT
  current_balance     INTEGER (cents)
  available_balance   INTEGER (cents)
  credit_limit        INTEGER (cents)
  currency            TEXT DEFAULT 'USD'
  is_manual           BOOLEAN DEFAULT false
  is_hidden           BOOLEAN DEFAULT false
  deleted_at          DATETIME
  created_at          DATETIME
  updated_at          DATETIME

  INDEX idx_accounts_household ON (household_id)
  INDEX idx_accounts_plaid_item ON (plaid_item_id) WHERE plaid_item_id IS NOT NULL

balance_history
  id              TEXT PRIMARY KEY
  account_id      TEXT FK → accounts
  date            DATE NOT NULL
  balance         INTEGER NOT NULL (cents)
  created_at      DATETIME
  UNIQUE(account_id, date)

  INDEX idx_balance_history_account_date ON (account_id, date)
```

### Merchants

```
merchants
  id              TEXT PRIMARY KEY
  household_id    TEXT FK → households
  name            TEXT NOT NULL (cleaned display name)
  raw_names       TEXT (JSON array of original Plaid names that map here)
  logo_url        TEXT
  category_id     TEXT FK → categories (default category for this merchant)
  created_at      DATETIME
  updated_at      DATETIME

  INDEX idx_merchants_household ON (household_id)
```

### Transactions

```
transactions
  id                      TEXT PRIMARY KEY
  account_id              TEXT FK → accounts
  household_id            TEXT FK → households
  plaid_transaction_id    TEXT
  pending_transaction_id  TEXT (links pending → posted)
  merchant_id             TEXT FK → merchants
  category_id             TEXT FK → categories
  recurring_transaction_id TEXT FK → recurring_transactions
  transfer_pair_id        TEXT (self-referencing, links transfer pairs)
  date                    DATE NOT NULL
  original_name           TEXT NOT NULL (raw from Plaid)
  name                    TEXT NOT NULL (display name, cleaned)
  amount                  INTEGER NOT NULL (cents, Plaid convention: positive = debit)
  normalized_amount       INTEGER NOT NULL (cents, positive = income, negative = expense)
  currency                TEXT DEFAULT 'USD'
  pending                 BOOLEAN DEFAULT false
  reviewed                BOOLEAN DEFAULT false
  notes                   TEXT
  tags                    TEXT (JSON array)
  is_transfer             BOOLEAN DEFAULT false
  deleted_at              DATETIME
  created_at              DATETIME
  updated_at              DATETIME

  INDEX idx_txn_account_date ON (account_id, date)
  INDEX idx_txn_category_date ON (category_id, date)
  INDEX idx_txn_household_date ON (household_id, date)
  INDEX idx_txn_date ON (date)
  INDEX idx_txn_plaid_id ON (plaid_transaction_id) WHERE plaid_transaction_id IS NOT NULL
  INDEX idx_txn_pending ON (account_id, pending) WHERE pending = 1
  INDEX idx_txn_merchant ON (merchant_id) WHERE merchant_id IS NOT NULL
  INDEX idx_txn_transfer ON (transfer_pair_id) WHERE transfer_pair_id IS NOT NULL

transaction_splits
  id              TEXT PRIMARY KEY
  transaction_id  TEXT FK → transactions
  category_id     TEXT FK → categories
  amount          INTEGER NOT NULL (cents)
  notes           TEXT
  created_at      DATETIME

  INDEX idx_splits_txn ON (transaction_id)

transaction_attachments
  id              TEXT PRIMARY KEY
  transaction_id  TEXT FK → transactions
  filename        TEXT NOT NULL
  file_path       TEXT NOT NULL (local storage path)
  mime_type       TEXT
  size_bytes      INTEGER
  created_at      DATETIME

  INDEX idx_attachments_txn ON (transaction_id)
```

### Categories

```
category_groups
  id              TEXT PRIMARY KEY
  household_id    TEXT FK → households
  name            TEXT NOT NULL
  icon            TEXT
  sort_order      INTEGER DEFAULT 0
  is_system       BOOLEAN DEFAULT false
  created_at      DATETIME

  INDEX idx_catgroups_household ON (household_id)

categories
  id              TEXT PRIMARY KEY
  household_id    TEXT FK → households
  group_id        TEXT FK → category_groups
  name            TEXT NOT NULL
  icon            TEXT
  is_income       BOOLEAN DEFAULT false
  is_system       BOOLEAN DEFAULT false
  sort_order      INTEGER DEFAULT 0
  created_at      DATETIME

  INDEX idx_categories_household ON (household_id)
  INDEX idx_categories_group ON (group_id)

category_rules
  id              TEXT PRIMARY KEY
  household_id    TEXT FK → households
  category_id     TEXT FK → categories
  match_field     TEXT CHECK (name, merchant) DEFAULT 'name'
  match_pattern   TEXT NOT NULL
  priority        INTEGER DEFAULT 0
  created_at      DATETIME

  INDEX idx_catrules_household ON (household_id, priority)
```

### Budgets

```
budgets
  id              TEXT PRIMARY KEY
  household_id    TEXT FK → households
  month           TEXT NOT NULL (YYYY-MM format)
  type            TEXT CHECK (category, flex) DEFAULT 'category'
  created_at      DATETIME
  updated_at      DATETIME
  UNIQUE(household_id, month)

budget_categories
  id              TEXT PRIMARY KEY
  budget_id       TEXT FK → budgets
  category_id     TEXT FK → categories
  limit_amount    INTEGER NOT NULL (cents)
  rollover        BOOLEAN DEFAULT false
  is_fixed        BOOLEAN DEFAULT false (for flex budgets: fixed vs variable)
  created_at      DATETIME
  UNIQUE(budget_id, category_id)

  INDEX idx_budgetcat_budget ON (budget_id)
```

### Recurring Transactions

```
recurring_transactions
  id              TEXT PRIMARY KEY
  household_id    TEXT FK → households
  plaid_stream_id TEXT (from Plaid's /recurring/get)
  name            TEXT NOT NULL
  merchant_id     TEXT FK → merchants
  category_id     TEXT FK → categories
  average_amount  INTEGER (cents)
  last_amount     INTEGER (cents)
  frequency       TEXT CHECK (weekly, biweekly, semimonthly, monthly, yearly)
  last_date       DATE
  next_date       DATE
  is_active       BOOLEAN DEFAULT true
  is_income       BOOLEAN DEFAULT false
  created_at      DATETIME
  updated_at      DATETIME

  INDEX idx_recurring_household ON (household_id)
  INDEX idx_recurring_next ON (next_date) WHERE is_active = 1
```

### Goals

```
goals
  id              TEXT PRIMARY KEY
  household_id    TEXT FK → households
  name            TEXT NOT NULL
  target_amount   INTEGER NOT NULL (cents)
  target_date     DATE
  linked_account_id TEXT FK → accounts
  icon            TEXT
  color           TEXT
  is_completed    BOOLEAN DEFAULT false
  created_at      DATETIME
  updated_at      DATETIME

  INDEX idx_goals_household ON (household_id)
```

`current_amount` is computed: if `linked_account_id` is set, read from `accounts.current_balance`; otherwise, sum contributions from a linked budget category or manual entries.

### Investments

```
investment_holdings
  id              TEXT PRIMARY KEY
  account_id      TEXT FK → accounts
  plaid_security_id TEXT
  security_name   TEXT NOT NULL
  ticker          TEXT
  quantity        REAL (fractional shares — keep as REAL)
  cost_basis      INTEGER (cents)
  current_value   INTEGER (cents)
  type            TEXT CHECK (stock, etf, mutual_fund, bond, crypto, cash, other)
  currency        TEXT DEFAULT 'USD'
  as_of_date      DATE NOT NULL
  created_at      DATETIME
  updated_at      DATETIME

  INDEX idx_holdings_account ON (account_id)
  INDEX idx_holdings_date ON (account_id, as_of_date)

holdings_history
  id              TEXT PRIMARY KEY
  account_id      TEXT FK → accounts
  plaid_security_id TEXT (stable identifier, tickers change)
  security_name   TEXT
  ticker          TEXT
  quantity        REAL (fractional shares — keep as REAL)
  value           INTEGER (cents)
  date            DATE NOT NULL
  created_at      DATETIME

  INDEX idx_holdingshistory_account_date ON (account_id, date)
  INDEX idx_holdingshistory_security ON (plaid_security_id, date)

investment_transactions
  id              TEXT PRIMARY KEY
  account_id      TEXT FK → accounts
  plaid_investment_transaction_id TEXT
  security_name   TEXT
  ticker          TEXT
  type            TEXT CHECK (buy, sell, dividend, transfer, fee, other)
  quantity        REAL (fractional shares — keep as REAL)
  price           INTEGER (cents)
  amount          INTEGER NOT NULL (cents)
  fees            INTEGER DEFAULT 0 (cents)
  date            DATE NOT NULL
  created_at      DATETIME

  INDEX idx_invtxn_account_date ON (account_id, date)
```

### Notifications & Saved Views

```
notification_preferences
  id              TEXT PRIMARY KEY
  user_id         TEXT FK → users
  bill_reminders  BOOLEAN DEFAULT true
  over_budget     BOOLEAN DEFAULT true
  large_transactions BOOLEAN DEFAULT true
  large_txn_threshold INTEGER DEFAULT 50000 (cents, i.e. $500)
  weekly_summary  BOOLEAN DEFAULT false
  created_at      DATETIME
  updated_at      DATETIME

saved_filters
  id              TEXT PRIMARY KEY
  user_id         TEXT FK → users
  name            TEXT NOT NULL
  filter_config   TEXT NOT NULL (JSON: date range, categories, accounts, tags, amount range)
  is_pinned       BOOLEAN DEFAULT false
  created_at      DATETIME
  updated_at      DATETIME

  INDEX idx_savedfilters_user ON (user_id)
```

## Plaid Integration

### Sync Strategy

1. **Initial sync:** Call `transactions/sync` without cursor. Loop until `has_more=false`. Persist final cursor to `plaid_items.sync_cursor`.
2. **Incremental sync:** Pass stored cursor. Process `added` (insert), `modified` (upsert by `plaid_transaction_id`), `removed` (soft-delete). Update cursor atomically with transaction writes in a single DB transaction.
3. **Pending→posted:** When a transaction is modified, Plaid may assign a new `transaction_id`. Use `pending_transaction_id` to link the pending version to its posted replacement. Delete the pending row, insert the posted one.
4. **Webhooks:** API route at `/api/plaid/webhook` handles `TRANSACTIONS_SYNC_UPDATES_AVAILABLE` (trigger sync), `ITEM_LOGIN_REQUIRED` (set `plaid_items.status = 'reauth_required'`), `ITEM_ERROR` (set status + error_code).
5. **Re-auth flow:** When status is `reauth_required`, show banner in UI. Use Plaid Link in update mode to re-authenticate.
6. **Recurring detection:** Use Plaid's `/transactions/recurring/get` endpoint. Populate `recurring_transactions` from `inflow_streams` and `outflow_streams`.
7. **Investments:** Call `/investments/holdings/get` for current positions and `/investments/transactions/get` for buy/sell/dividend history.

### Environment Config

```env
# Required
ENCRYPTION_KEY=...              # For encrypting access tokens + AI keys
AUTH_SECRET=...                 # Better Auth session secret
DATABASE_PATH=./data/ledgr.db  # SQLite file path

# Plaid (required — core bank sync feature)
PLAID_CLIENT_ID=...
PLAID_SECRET=...
PLAID_ENV=sandbox|development|production
PLAID_SYNC_MODE=poll|webhook   # Default: poll (no public URL needed)
PLAID_WEBHOOK_URL=...          # Only needed if PLAID_SYNC_MODE=webhook
```

### Amount Convention

- **All amounts stored as INTEGER in cents.** $12.50 from Plaid → 1250 in the database.
- **`amount`:** Raw Plaid convention in cents. Positive = money leaving account (debit/expense). Negative = money entering account (credit/income).
- **`normalized_amount`:** Flipped sign in cents for human display. Positive = income, negative = expense.
- **All internal queries and aggregations use `amount` (Plaid convention).**
- **All UI display uses `normalized_amount`** converted to dollars via `lib/money.ts` helpers.
- **CSV imports:** Detect sign convention from the file (some banks use positive for credits). Normalize to Plaid convention on import.

## Auto-Categorization Pipeline

Order of precedence:
1. **User's manual category rules** — pattern match on `name` or `merchant_name`, ordered by priority
2. **Merchant default** — if `merchants.category_id` is set
3. **LLM fallback** — send uncategorized transactions to user's configured AI provider in batch. AI suggests categories from the user's existing category list.
4. **Uncategorized** — default if all else fails, flagged for review

## Feature Modules

### Dashboard
- Customizable widget grid (drag-and-drop via Client Component)
- Widgets: net worth chart, spending by category (donut), monthly cash flow (bar), recent transactions, budget progress bars, upcoming bills, goal progress, account balances
- Widget config stored in `user_settings` as JSON

### Transaction Management
- Searchable, filterable list (Server Component with client-side search)
- Bulk edit (select multiple → re-categorize, tag, mark reviewed)
- Split transaction UI (split one transaction across multiple categories)
- Transfer detection UI (link two transactions as a transfer pair)
- Reviewed/unreviewed toggle for daily review workflow

### Budgets
- Monthly view with category progress bars
- Category budget: set per-category limits, track spending vs limit
- Flex budget: separate fixed (rent, insurance) vs variable (dining, entertainment), focus on variable spending
- Rollover: unspent amounts carry to next month
- Budget template: copy last month's budget as starting point

### Net Worth
- Line chart over time (from `balance_history`)
- Assets vs liabilities breakdown
- Account-level contribution to net worth
- Manual asset support (real estate value, vehicles, etc. via manual accounts)

### Investments
- Portfolio overview: total value, day change, allocation pie chart
- Holdings table: ticker, shares, cost basis, current value, gain/loss
- Performance over time chart (from `holdings_history`)
- Transaction history: buys, sells, dividends

### Goals
- Card-based UI with progress bars
- Link to account balance or track manually
- Monthly contribution tracking via budget integration
- Projected completion date based on current pace

### Bills & Subscriptions
- Calendar view of upcoming recurring transactions
- List view with frequency, last/next date, amount
- Active/inactive toggle
- Detection powered by Plaid's recurring endpoint

### Reports
- Spending by category (bar/pie), filterable by date range and account
- Income vs expenses over time (line chart)
- Month-in-review summary (top categories, cash flow, net worth delta)
- Category trends (month-over-month comparison)
- Saved filters for quick access to custom views
- CSV export

### Household Sharing
- Owner invites members via email
- Roles: owner (full access), member (full access), advisor (read-only)
- All data scoped to household, not individual user
- Privacy: individual users can hide specific accounts from shared view via `accounts.is_hidden`

### AI Assistant
- BYOK: user configures provider + model + API key in settings
- Features: batch categorization of uncategorized transactions, natural language queries ("how much did I spend on dining in April?"), anomaly detection (unusual charges), spending insights
- Streaming responses via Vercel AI SDK + API route
- AI never sees raw Plaid tokens or auth data — only transaction/category data

## Security

- **Plaid access tokens:** Encrypted at rest (aes-256-gcm) with key from `ENCRYPTION_KEY` env var
- **AI API keys:** Same encryption
- **Ownership enforcement:** `scopedQuery(householdId)` wrapper auto-injects `household_id` filtering on all queries and mutations. No manual ownership checks — the wrapper makes data leaks from missed WHERE clauses impossible.
- **Better Auth:** Handles session management, password hashing, OAuth providers
- **SQLite file:** Should be stored in a non-public directory with restrictive file permissions
- **Plaid webhooks:** Verify webhook signature using Plaid's verification endpoint
- **No financial credentials stored:** Plaid is read-only, no ability to move money

## Deployment

### Supported Targets

- **Docker on VPS** (primary target) — DigitalOcean, Hetzner, Fly.io, Railway, any Linux server
- **Docker on local machine** — for personal use
- **Bare metal** — Node.js 20+ directly on a server

**Explicitly NOT supported:** Serverless platforms (Vercel, Cloudflare Workers, AWS Lambda). SQLite requires a persistent filesystem that survives redeployments.

### Docker Setup

```
ledgr/
├── Dockerfile              # Multi-stage: build Next.js, copy to slim runner
├── docker-compose.yml      # App + volume for data/
├── data/                   # Persistent volume mount
│   ├── ledgr.db            # SQLite database
│   ├── ledgr.db-wal        # WAL file
│   └── attachments/        # Receipt photos
```

`docker-compose.yml`:
```yaml
services:
  ledgr:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ledgr-data:/app/data
    env_file: .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3

volumes:
  ledgr-data:
```

Goal: `docker compose up` → working app in under 2 minutes.

### Health Check

`GET /api/health` returns `{ status: "ok", version: "1.0.0", db: "connected" }`.

### Backup & Restore

SQLite backup is just copying the file. Document:
- Stop the app (or use SQLite `.backup` command for hot backup)
- Copy `data/ledgr.db` to backup location
- Restore: replace the file, restart

## Data Import

### CSV Import (First-Class)

CSV import supplements Plaid for accounts not supported by Plaid.

- Upload CSV file via UI
- Column mapping step: user maps CSV columns to Ledgr fields (date, description, amount, category)
- Preview parsed transactions before import
- Auto-detect common bank export formats (Chase, Bank of America, Wells Fargo, etc.)
- Deduplication: match on date + amount + description to prevent re-importing
- Assign to account (existing or create new manual account)

### OFX/QFX Import

- Parse OFX/QFX files (standard bank export format)
- Auto-map fields (OFX has a defined schema)
- Same deduplication and account assignment as CSV

### Export

- CSV export of transactions with all fields
- Date range and account filters
- Useful for tax prep, switching apps, or backup

## Background Jobs

Next.js has no built-in job scheduler. Self-hosters can't use Vercel cron. Use `node-cron` running in the same process.

### Scheduled Jobs

| Job | Default Schedule | Description |
|-----|-----------------|-------------|
| Plaid transaction sync | Every 4 hours | Poll `transactions/sync` for all active plaid_items |
| Balance snapshot | Daily at midnight | Record `balance_history` for all accounts |
| Recurring detection | Daily at 1am | Call Plaid `/transactions/recurring/get` |
| Holdings snapshot | Daily at 2am | Record `holdings_history` for investment accounts |
| AI batch categorization | Every 4 hours (after sync) | Categorize uncategorized transactions via LLM |

### Poll-Based Sync (Alternative to Webhooks)

Plaid webhooks require a stable public URL. Self-hosters behind NAT/CGNAT cannot receive webhooks. Offer both modes:

- **Webhook mode:** Configure `PLAID_WEBHOOK_URL` — Plaid pushes sync notifications
- **Poll mode:** (default) `node-cron` polls `transactions/sync` on schedule. No public URL needed.

## Demo Mode

On first boot, if no accounts exist, offer to load sample data:

- 3 sample accounts (checking, savings, credit card) with 6 months of realistic transactions
- Pre-populated categories, a sample budget, and a savings goal
- Dashboard is fully functional with charts and reports
- Banner: "You're viewing demo data. Connect your bank or import a CSV to get started."
- One-click to clear demo data and start fresh

Demo data is critical for adoption — users must feel the product before configuring credentials.

## SQLite Configuration

```sql
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
```

Set at Drizzle connection initialization. WAL mode allows concurrent reads during writes. `busy_timeout` prevents immediate SQLITE_BUSY errors under household concurrency.

## Project Structure

```
ledgr/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # Login, signup, onboarding
│   │   ├── (dashboard)/        # Main app layout
│   │   │   ├── accounts/
│   │   │   ├── transactions/
│   │   │   ├── budgets/
│   │   │   ├── investments/
│   │   │   ├── goals/
│   │   │   ├── bills/
│   │   │   ├── reports/
│   │   │   ├── settings/
│   │   │   └── page.tsx        # Dashboard home
│   │   └── api/
│   │       ├── plaid/
│   │       │   ├── webhook/
│   │       │   └── link-token/
│   │       ├── ai/
│   │       │   └── chat/
│   │       ├── import/         # CSV/OFX upload endpoint
│   │       └── health/         # Health check endpoint
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── charts/             # Recharts wrappers
│   │   ├── dashboard/          # Widget components
│   │   ├── import/             # CSV column mapper, preview table
│   │   └── shared/             # Layout, nav, etc.
│   ├── db/
│   │   ├── schema/             # Drizzle schema files (one per domain)
│   │   │   ├── accounts.ts
│   │   │   ├── transactions.ts
│   │   │   ├── budgets.ts
│   │   │   ├── categories.ts
│   │   │   ├── investments.ts
│   │   │   ├── goals.ts
│   │   │   ├── merchants.ts
│   │   │   ├── plaid.ts
│   │   │   ├── households.ts
│   │   │   └── index.ts
│   │   ├── seed/               # Default categories + demo data
│   │   ├── migrations/
│   │   └── index.ts            # Drizzle client + SQLite connection + PRAGMAs
│   ├── lib/
│   │   ├── plaid/              # Plaid client, sync logic, webhook handler
│   │   ├── ai/                 # AI categorization, chat, insights
│   │   ├── auth/               # Better Auth config + adapter interface
│   │   ├── import/             # CSV parser, OFX parser, deduplication
│   │   ├── jobs/               # node-cron scheduler, job definitions
│   │   ├── encryption.ts       # AES encrypt/decrypt helpers
│   │   ├── scoped-query.ts     # Auto-inject household_id on all queries
│   │   └── money.ts            # Cents ↔ display conversion helpers
│   ├── actions/                # Server Actions (mutations)
│   └── queries/                # Server-side data fetching functions
├── data/                       # Persistent data (Docker volume mount point)
│   └── .gitkeep
├── public/
├── Dockerfile
├── docker-compose.yml
├── drizzle.config.ts
├── next.config.ts
├── tailwind.config.ts
├── package.json
└── .env.example
```

## Default Categories

Seeded on first setup:

| Group | Categories |
|-------|-----------|
| Income | Salary, Freelance, Interest, Dividends, Refunds, Other Income |
| Housing | Rent/Mortgage, Property Tax, Home Insurance, HOA, Maintenance |
| Transportation | Gas, Public Transit, Parking, Car Insurance, Car Payment, Ride Share |
| Food | Groceries, Dining Out, Coffee, Delivery |
| Utilities | Electric, Gas, Water, Internet, Phone |
| Health | Doctor, Dentist, Pharmacy, Gym, Insurance Premium |
| Entertainment | Streaming, Movies, Games, Hobbies, Events |
| Shopping | Clothing, Electronics, Home Goods, Gifts |
| Personal | Haircut, Laundry, Pet Care |
| Education | Tuition, Books, Courses |
| Financial | Bank Fees, ATM Fees, Interest Paid, Late Fees |
| Travel | Flights, Hotels, Car Rental, Vacation |
| Subscriptions | Software, Memberships, Magazines |
| Transfers | (system category, excluded from budgets/reports) |
| Uncategorized | (system default) |
