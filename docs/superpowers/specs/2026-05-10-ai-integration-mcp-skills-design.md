# Ledgr AI Integration: MCP Server + Skills + MCP App UI

**Date:** 2026-05-10
**Status:** Design
**Scope:** Remote MCP server with OAuth 2.1, Agent Skills, interactive MCP App UI widgets

## Overview

Add an AI integration layer so users can connect Ledgr to AI assistants (Claude, ChatGPT, Codex, OpenClaw) and ask questions about their finances. Three components:

1. **MCP Server** — Remote server exposing financial data/actions as MCP tools over Streamable HTTP
2. **Agent Skills** — SKILL.md files teaching AI assistants financial analysis workflows
3. **MCP App UI** — Interactive React widgets (charts, tables, dashboards) rendered inside AI chat via the ext-apps spec

Self-hosted single-user deployment (Docker on VPS). The MCP server runs in the same Next.js process, sharing the SQLite database.

---

## 1. MCP Server Foundation

### Transport & Runtime

- **Protocol:** MCP (Model Context Protocol) over Streamable HTTP transport
- **SDK:** `@modelcontextprotocol/sdk` (raw SDK, not `mcp-handler` which requires Vercel serverless)
- **Route:** `POST /api/mcp` — single endpoint handling JSON-RPC 2.0 messages
- **Runtime:** Runs in the same Next.js process, shares the SQLite connection pool from `src/db/index.ts`
- **Session management:** `WebStandardStreamableHTTPServerTransport` handles session lifecycle via `Mcp-Session-Id` header

### Architecture

```
AI Client (Claude/ChatGPT/Codex)
  │
  ▼ Streamable HTTP (JSON-RPC 2.0)
POST /api/mcp
  │
  ├── OAuth 2.1 token validation → householdId from JWT claims
  │
  ├── McpServer instance
  │     ├── Read tools → reuse src/queries/*
  │     ├── Write tools → reuse action logic (bypass Server Action wrappers)
  │     └── App tools → return structuredContent + UI resource URIs
  │
  └── SQLite (shared connection, WAL mode)
```

### Key Design Decisions

- **Same-process, not sidecar:** No separate MCP process. The Next.js API route handler creates a `McpServer` instance and delegates to existing query/action functions. This avoids a second SQLite connection and simplifies deployment.
- **householdId from JWT, not `getHouseholdId()`:** The existing `getHouseholdId()` uses React `cache()` + `next/headers`, which don't exist in API route context. Instead, extract `householdId` from the validated OAuth JWT claims and thread it into `scopedQuery(householdId)`.
- **Rate limiting via syncLog:** `sync_accounts` tool enforces 60s minimum between syncs per institution using the existing `sync_log` table. No external rate limiter needed.

### File Structure

```
src/
├── app/api/mcp/
│   └── route.ts              # POST handler: auth → transport → McpServer
├── lib/mcp/
│   ├── server.ts             # McpServer factory + tool registration
│   ├── tools/
│   │   ├── accounts.ts       # list_accounts, get_account_summary
│   │   ├── transactions.ts   # get_transactions (search + list unified)
│   │   ├── budgets.ts        # get_budget, set_budget_category
│   │   ├── dashboard.ts      # get_dashboard_summary
│   │   ├── reports.ts        # get_spending_report, get_income_vs_expense
│   │   ├── recurring.ts      # get_upcoming_bills
│   │   ├── investments.ts    # get_portfolio_summary, get_holdings
│   │   ├── categories.ts     # list_categories, update_transaction_category
│   │   └── sync.ts           # sync_accounts
│   ├── auth/
│   │   ├── oauth-server.ts   # OAuth 2.1 authorization server (PKCE)
│   │   ├── token.ts          # JWT issue/validate, householdId in claims
│   │   └── discovery.ts      # .well-known endpoints
│   ├── apps/
│   │   ├── widgets/          # MCP App UI widget HTML bundles
│   │   │   ├── spending-breakdown.html
│   │   │   ├── transaction-table.html
│   │   │   ├── budget-progress.html
│   │   │   └── net-worth-trend.html
│   │   └── register.ts       # registerAppTool + registerAppResource calls
│   └── rate-limit.ts         # sync rate limiting via syncLog
```

---

## 2. Tool Inventory (13 Tools)

### Read Tools (9)

| Tool | Reuses | Description |
|------|--------|-------------|
| `list_accounts` | `queries/accounts.ts → getAccounts` | All accounts with balances, types, institution names |
| `get_account_summary` | `queries/accounts.ts → getAccountSummary` | Aggregate balances by type (checking, savings, credit, investment) |
| `get_transactions` | `queries/transactions.ts → getTransactions` | Cursor-paginated list with filters: date range, category, account, amount range, search text. Returns 50 per page. |
| `get_budget` | `queries/budgets.ts → getBudgetForMonth` | Budget for a given month with category-level allocated vs spent |
| `get_dashboard_summary` | `queries/dashboard.ts → getDashboardSummary` | Net worth, monthly income/expenses, account count, top spending categories |
| `get_spending_report` | `queries/reports.ts → getSpendingByCategory` | Spending breakdown by category for a date range |
| `get_income_vs_expense` | `queries/reports.ts → getIncomeVsExpense` | Monthly income vs expense comparison over a date range |
| `get_upcoming_bills` | `queries/recurring.ts → getUpcomingBills` | Upcoming recurring transactions with amounts and due dates |
| `get_portfolio_summary` | `queries/investments.ts → getPortfolioSummary` | Investment portfolio value, allocation, and performance |

### Write Tools (3)

| Tool | Reuses | Description |
|------|--------|-------------|
| `update_transaction_category` | `actions/transactions.ts → updateTransactionCategory` | Re-categorize a transaction. Sets `categorySource = "manual"`. |
| `set_budget_category` | `actions/budgets.ts → setBudgetCategory` | Set or update a budget allocation for a category in a given month |
| `sync_accounts` | `actions/sync.ts` + `lib/plaid/sync.ts → syncInstitution` | Trigger Plaid sync for all linked institutions. Rate-limited: 60s cooldown per institution. |

### App Tool (1)

| Tool | Description |
|------|-------------|
| `show_financial_dashboard` | Returns interactive UI widget based on `view` parameter. Views: `spending-breakdown`, `transaction-table`, `budget-progress`, `net-worth-trend`. Data embedded in `structuredContent`, widget rendered via MCP App UI iframe. |

### Amount Format Convention

All tools return monetary values in dual format:
```json
{
  "amountCents": 125000,
  "amountDisplay": "$1,250.00"
}
```
`amountCents` for AI math reasoning, `amountDisplay` for human-readable output. Formatted via `lib/money.ts → centsToDisplay()`.

### Tool Annotations

Every tool includes MCP tool annotations for client-side UI hints:

```typescript
{
  readOnlyHint: true,       // read tools
  destructiveHint: false,   // write tools (none are destructive)
  openWorldHint: false,     // all tools operate on local data only
  idempotentHint: true,     // set_budget_category, update_transaction_category
}
```

`sync_accounts` gets `openWorldHint: true` (calls Plaid API) and `idempotentHint: false`.

---

## 3. OAuth 2.1 Authentication

### Flow

Standard MCP OAuth 2.1 with PKCE. Ledgr acts as both authorization server and resource server.

```
1. AI client discovers auth: GET /.well-known/oauth-protected-resource
   → Returns { resource: "https://ledgr.example.com", authorization_servers: [...] }

2. Client fetches server metadata: GET /.well-known/oauth-authorization-server
   → Returns endpoints, supported grants, PKCE requirement

3. Client registers dynamically: POST /api/mcp/oauth/register (RFC 7591)
   → Returns client_id (no client_secret — public clients only)

4. User authorizes: GET /api/mcp/oauth/authorize?code_challenge=...&resource=...
   → Ledgr login page (reuse Better Auth session if active)
   → Consent screen: "Allow [client_name] to access your financial data?"
   → Redirect back with authorization code

5. Token exchange: POST /api/mcp/oauth/token
   → Returns { access_token (JWT), refresh_token, expires_in: 3600 }

6. MCP requests: POST /api/mcp with Authorization: Bearer <jwt>
   → 401 + WWW-Authenticate if expired/invalid
```

### JWT Claims

```json
{
  "sub": "<userId>",
  "household_id": "<householdId>",
  "scope": "ledgr:read ledgr:write ledgr:sync",
  "iss": "https://ledgr.example.com",
  "aud": "https://ledgr.example.com",
  "exp": 1715400000,
  "iat": 1715396400
}
```

`household_id` is the critical claim — threaded into `scopedQuery()` for every tool handler.

### Scope Model

| Scope | Tools |
|-------|-------|
| `ledgr:read` | All read tools + show_financial_dashboard |
| `ledgr:write` | update_transaction_category, set_budget_category |
| `ledgr:sync` | sync_accounts |

Default grant: `ledgr:read ledgr:write ledgr:sync` (full access). Users can restrict at consent screen.

### Security

- **PKCE required** (plain challenge not accepted, S256 only)
- **Authorization codes:** single-use, 10-minute expiry, bound to code_challenge
- **Access tokens:** JWT, 1-hour expiry, signed with HMAC-SHA256 using `ENCRYPTION_KEY`
- **Refresh tokens:** opaque, 30-day expiry, stored in SQLite, rotated on use
- **Dynamic client registration:** open (RFC 7591) — any MCP client can register. Registration returns `client_id` only (public client, no secret).
- **Consent required:** user must explicitly approve each client. Consent record stored in `oauth_consents` table.
- **Resource indicator:** `resource=https://ledgr.example.com` (RFC 8707) included in authorization and token requests

### OAuth Database Tables

```sql
-- Dynamic client registrations
CREATE TABLE oauth_clients (
  id TEXT PRIMARY KEY,
  client_id TEXT UNIQUE NOT NULL,
  client_name TEXT,
  redirect_uris TEXT NOT NULL,  -- JSON array
  created_at TEXT NOT NULL
);

-- Authorization codes (short-lived)
CREATE TABLE oauth_codes (
  code TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL DEFAULT 'S256',
  redirect_uri TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);

-- Refresh tokens
CREATE TABLE oauth_refresh_tokens (
  token TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);

-- User consent records
CREATE TABLE oauth_consents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  UNIQUE(user_id, client_id)
);
```

### Discovery Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /.well-known/oauth-protected-resource` | RFC 9728 — resource metadata |
| `GET /.well-known/oauth-authorization-server` | RFC 8414 — server metadata |
| `POST /api/mcp/oauth/register` | RFC 7591 — dynamic client registration |
| `GET /api/mcp/oauth/authorize` | Authorization endpoint (shows consent UI) |
| `POST /api/mcp/oauth/token` | Token endpoint (code exchange + refresh) |
| `POST /api/mcp/oauth/revoke` | Token revocation (RFC 7009) |

### Consent UI

A standalone page at `/mcp/authorize` (outside the dashboard layout). Shows:
- Client name (from dynamic registration)
- Requested scopes in plain language
- "Allow" / "Deny" buttons
- If user has active Better Auth session, skip login. Otherwise, redirect to login first.

---

## 4. Agent Skills (5 Skills)

Skills are SKILL.md files that teach AI assistants how to analyze finances using Ledgr's MCP tools. They follow the open Agent Skills standard — metadata loads at startup (~100 tokens), full content loads on demand.

### Distribution

Skills are bundled as a Plugin (`ledgr-plugin`) containing all 5 skills + the MCP server config. One-click install in Claude Code, Codex, or any skills-compatible client.

### File Structure

```
ledgr-plugin/
├── plugin.json              # Plugin manifest
├── skills/
│   ├── monthly-review/
│   │   └── SKILL.md         # Monthly spending review workflow
│   ├── budget-check/
│   │   └── SKILL.md         # Budget vs actual analysis
│   ├── subscription-audit/
│   │   └── SKILL.md         # Find and evaluate recurring charges
│   ├── savings-analysis/
│   │   └── SKILL.md         # Savings rate and opportunity identification
│   └── net-worth-tracking/
│       └── SKILL.md         # Net worth trend analysis
└── mcp.json                 # MCP server connection config
```

### Skill Summaries

**1. monthly-review** — "Review my spending this month"
- Fetches dashboard summary + spending by category
- Compares to previous month (calculates deltas)
- Highlights top 3 category changes
- Shows spending breakdown widget via `show_financial_dashboard`
- Formats amounts using `amountDisplay` for narration

**2. budget-check** — "How am I doing on my budget?"
- Fetches current month's budget with category allocations
- Calculates percent used, days remaining, projected overspend
- Flags categories >80% used with >10 days remaining
- Shows budget progress widget
- Suggests reallocation if under-budget categories exist

**3. subscription-audit** — "What subscriptions am I paying for?"
- Fetches upcoming bills / recurring transactions
- Groups by frequency (monthly, annual, weekly)
- Calculates total monthly recurring cost
- Flags potential duplicates (similar amounts, same category)
- Suggests cancellation candidates based on usage patterns

**4. savings-analysis** — "What's my savings rate?"
- Fetches income vs expense for last 3 months
- Calculates savings rate (income - expenses) / income
- Identifies top discretionary spending categories
- Models "what if you cut X by 20%" scenarios
- Shows income vs expense trend widget

**5. net-worth-tracking** — "How is my net worth trending?"
- Fetches account summary + net worth history
- Calculates month-over-month and year-over-year changes
- Breaks down by asset type (liquid, investment, property) vs liabilities
- Shows net worth trend widget
- Highlights largest contributors to change

### Skill Template Structure

Each SKILL.md follows this pattern:

```markdown
---
name: ledgr:monthly-review
description: Review monthly spending patterns and compare to previous months
version: 1.0.0
tools:
  - get_dashboard_summary
  - get_spending_report
  - show_financial_dashboard
---

# Monthly Spending Review

## When to use
[Trigger conditions]

## Steps
1. [Tool call with specific parameters]
2. [Analysis logic]
3. [Widget display]
4. [Summary format]

## Output format
[How to present results to user]
```

---

## 5. MCP App UI Widgets

### Design System: Match Existing Ledgr Webapp

MCP App widgets render in sandboxed iframes via the ext-apps spec. They cannot access the Ledgr server directly — all data arrives pre-embedded via `structuredContent` in the MCP tool result.

**The widgets mirror the existing Ledgr design system**, not a separate aesthetic:

- **CSS variables:** Extract the OKLCh color tokens from `globals.css` (background, foreground, primary, muted, card, chart-1 through chart-5, destructive, etc.) into a `ledgr-theme.css` bundled with each widget
- **Fonts:** Geist (sans) + Geist Mono — same as the webapp's `layout.tsx`
- **Component patterns:** shadcn/ui-style cards, tables, badges, progress bars — same border-radius scale, same spacing
- **Charts:** Recharts with the same chart color palette (chart-1 through chart-5 CSS variables)
- **Dark mode:** `onhostcontextchanged` callback maps the host theme to Ledgr's light/dark CSS variable sets

This means the spending chart a user sees in the Ledgr dashboard looks identical to the one rendered inside Claude chat.

### Widget Architecture

```
MCP Tool Result
  │
  ├── content: [{ type: "text", text: "JSON summary for AI reasoning" }]
  │
  └── structuredContent: { data: { ... } }
        │
        ▼
  MCP App iframe (sandboxed)
    ├── ledgr-theme.css (extracted Tailwind tokens)
    ├── React 19 + Recharts (bundled)
    ├── PostMessageTransport ← receives structuredContent
    └── Renders chart/table/dashboard
```

### Four Widgets

**1. Spending Breakdown** (`spending-breakdown.html`)
- Recharts `PieChart` (donut) showing spending by category
- Category legend with amounts and percentages
- Period label (e.g., "May 2026")
- Data: `{ categories: [{ name, amountCents, amountDisplay, percentage, color }], period, totalDisplay }`

**2. Transaction Table** (`transaction-table.html`)
- Sortable table: date, merchant/name, category, amount
- Color-coded amounts (green for income, default for expenses)
- Compact rows optimized for 400-600px width
- Pagination controls (if >20 rows)
- Data: `{ transactions: [{ date, name, merchant, category, amountCents, amountDisplay, isIncome }], totalCount, page }`

**3. Budget Progress** (`budget-progress.html`)
- Category-level horizontal bars: spent vs allocated
- Color coding: green (<80%), amber (80-100%), red (>100%)
- Overall budget utilization at top
- Days remaining in period
- Data: `{ month, categories: [{ name, allocatedCents, spentCents, allocatedDisplay, spentDisplay, percentUsed }], totalAllocatedDisplay, totalSpentDisplay, daysRemaining }`

**4. Net Worth Trend** (`net-worth-trend.html`)
- Recharts `AreaChart` showing net worth over time
- Assets and liabilities as stacked areas, net worth as the line
- Hover tooltip with exact values
- Period selector rendered from data (3M, 6M, 1Y, All)
- Data: `{ points: [{ date, assetsCents, liabilitiesCents, netWorthCents, assetsDisplay, liabilitiesDisplay, netWorthDisplay }], currentNetWorthDisplay, changeDisplay, changePercent }`

### Widget Build Process

Each widget is a standalone HTML file containing:
1. `ledgr-theme.css` (inlined) — extracted from `globals.css`
2. React 19 + Recharts (bundled via esbuild/Vite)
3. `@modelcontextprotocol/ext-apps` client library
4. Widget component code

Build step: `pnpm build:mcp-widgets` — compiles each widget's React source into a self-contained HTML file in `src/lib/mcp/apps/widgets/`.

Widgets are registered as MCP resources via `registerAppResource()` and referenced by `show_financial_dashboard` tool's `_meta.ui.resourceUri`.

### Client-Side Initialization (all widgets)

```typescript
import { App, PostMessageTransport, applyDocumentTheme } from "@modelcontextprotocol/ext-apps";

const app = new App({ name: "Ledgr", version: "1.0.0" });

app.ontoolinput = (input) => {
  const { data } = input.arguments;
  renderWidget(data); // widget-specific render function
};

app.onhostcontextchanged = (ctx) => {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  // Maps host theme to Ledgr light/dark CSS variables
};

await app.connect(new PostMessageTransport());
```

### Size Constraints

- Target: <100KB per widget bundle (gzipped)
- Recharts is the largest dependency (~45KB gzipped) — shared across chart widgets
- Render at 400-600px width (chat panel width)
- No external network requests from widgets
- No lazy loading — all data pre-embedded in structuredContent

---

## 6. Plaid Compliance

Exposing Plaid-sourced data via MCP requires compliance with Plaid's Terms of Service:

- **Consent step:** Add a toggle in Ledgr Settings > AI Integration: "Allow AI assistants to access your financial data via MCP". Off by default. MCP endpoint returns 403 if disabled.
- **Privacy policy:** Document that Plaid data may be shared with user-configured AI providers when MCP is enabled.
- **No data caching by AI:** Skills instruct AI assistants not to store or cache financial data beyond the conversation.
- **User controls:** OAuth consent screen shows exactly which data types the AI client can access. Users can revoke consent at any time from Settings.

---

## 7. Implementation Phases

### Phase A: MCP Server + OAuth (foundation)

1. Add `@modelcontextprotocol/sdk` dependency
2. Create OAuth 2.1 tables (Drizzle schema + migration)
3. Implement OAuth discovery, registration, authorization, token endpoints
4. Implement consent UI page (`/mcp/authorize`)
5. Create `POST /api/mcp` route with auth middleware
6. Implement McpServer factory with tool registration
7. Wire up 9 read tools (delegate to existing queries)
8. Wire up 3 write tools (delegate to existing action logic)
9. Add rate limiting for sync_accounts
10. Add MCP consent toggle in Settings

### Phase B: Skills + Plugin

1. Write 5 SKILL.md files
2. Create plugin.json manifest
3. Create mcp.json connection config
4. Test with Claude Code (local install)

### Phase C: MCP App UI

1. Set up widget build pipeline (esbuild/Vite → standalone HTML)
2. Extract `ledgr-theme.css` from `globals.css`
3. Build 4 widget components
4. Add `@modelcontextprotocol/ext-apps` dependency
5. Register app tools and resources
6. Implement `show_financial_dashboard` tool
7. Test widgets in Claude chat

### Dependencies

- Phase A is independent (can start immediately)
- Phase B depends on Phase A (skills reference MCP tool names)
- Phase C depends on Phase A (app tools need the MCP server running)
- Phases B and C are independent of each other

---

## 8. New Dependencies

```json
{
  "@modelcontextprotocol/sdk": "latest",
  "@modelcontextprotocol/ext-apps": "latest",
  "jose": "^6.0.0"
}
```

- `@modelcontextprotocol/sdk` — MCP server, transport, tool registration
- `@modelcontextprotocol/ext-apps` — MCP App UI (registerAppTool, registerAppResource, client-side App)
- `jose` — JWT signing/verification for OAuth tokens (lightweight, no native deps)

Dev dependencies for widget build:
```json
{
  "esbuild": "^0.25.0"
}
```

---

## 9. Configuration

### Environment Variables

```bash
# Required for MCP (add to .env)
MCP_ENABLED=true                    # Master toggle for MCP endpoint
LEDGR_URL=https://ledgr.example.com # Public URL for OAuth redirects and resource indicator

# Existing (already required)
ENCRYPTION_KEY=...                  # Reused for JWT signing
```

### Settings UI Addition

Settings > AI Integration section:
- **MCP Access:** Toggle (on/off) — controls whether `/api/mcp` accepts requests
- **Connected Clients:** List of OAuth clients with "Revoke" buttons
- **Scopes:** Read-only display of granted scopes per client
