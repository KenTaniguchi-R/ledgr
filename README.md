<div align="center">

<img src="docs/images/logo.png" alt="Ledgr" width="120" />

# Ledgr

**Self-hostable personal finance app with Plaid bank sync and AI agent support via MCP.**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED.svg)](https://www.docker.com/)
[![MCP](https://img.shields.io/badge/MCP-enabled-orange.svg)](https://modelcontextprotocol.io)

<!-- TODO: Add hero screenshot once dashboard UI is complete -->
<!-- <img src="docs/images/hero.png" alt="Ledgr Dashboard" width="800" /> -->

</div>

---

Ledgr connects to your bank accounts through Plaid, automatically syncs and categorizes transactions, and gives you budgets, investment tracking, bill detection, and financial reports — all running on your own server with your own data.

It also exposes a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server, so AI assistants like Claude can query your finances, generate reports, and manage budgets through natural conversation.

## Why Ledgr?

Most personal finance apps either lock your data in their cloud or require you to manually import CSVs. Ledgr is different:

- **Plaid-first** — connects directly to 12,000+ banks. Your transactions sync automatically, not manually
- **MCP-enabled** — the only open-source finance app with a built-in AI agent interface. Ask Claude about your spending instead of clicking through dashboards
- **Self-hosted** — Docker Compose with PostgreSQL. Your financial data never leaves your server
- **Smart categorization** — four-tier pipeline (your rules > merchant defaults > Plaid categories > AI) that learns from your corrections

| | Ledgr | Actual Budget | Firefly III | Maybe |
|---|---|---|---|---|
| Automatic bank sync | Plaid | GoCardless (EU) | Spectre/GoCardless | Manual only |
| AI agent (MCP) | Yes | No | No | No |
| Database | PostgreSQL | SQLite | MySQL/Postgres | Postgres |
| Self-hostable | Yes | Yes | Yes | Yes |
| Investment tracking | Yes | No | No | Yes |

## Features

**Core**
- Automatic bank sync via Plaid (checking, savings, credit cards, investments)
- Transaction categorization pipeline (user rules > merchant defaults > Plaid categories > AI)
- Budgets with category-level tracking
- Recurring transaction & bill detection
- Investment portfolio tracking with holdings history
- Financial reports (spending breakdown, income vs. expense, net worth trends)
- CSV/OFX import for accounts not supported by Plaid

**AI & MCP**
- MCP server with OAuth — connect Claude Desktop, Claude Code, or any MCP client
- 10 tool endpoints: accounts, transactions, budgets, categories, investments, reports, recurring, sync, and dashboard
- Interactive dashboard widgets served as MCP Apps
- BYOK (Bring Your Own Key) AI categorization — works with Claude, GPT, Gemini

**Self-Hosting**
- Docker Compose with PostgreSQL — `docker compose up` and you're running
- All data stays on your machine
- Multi-user support with household-based data isolation

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+
- A [Plaid](https://plaid.com/) account (free tier works for development)

### 1. Clone and install

```bash
git clone https://github.com/KenTaniguchi-R/ledgr.git
cd ledgr
pnpm install
```

### 2. Set up Plaid

1. Sign up at [dashboard.plaid.com](https://dashboard.plaid.com/signup)
2. Go to [Developers > Keys](https://dashboard.plaid.com/developers/keys) to get your `client_id` and secret
3. Get your **Production** keys to connect real bank accounts. Sandbox keys are available for testing with fake data

### 3. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
# Generate these:
ENCRYPTION_KEY=           # Run: openssl rand -hex 32
AUTH_SECRET=              # Run: openssl rand -base64 32

# From Plaid dashboard:
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_production_secret
PLAID_ENV=production      # production | sandbox (sandbox uses fake data)
```

### 4. Initialize database and run

```bash
pnpm db:setup             # Generate and run migrations
pnpm dev                  # Start dev server at http://localhost:3000
```

Create an account, then link your bank through the Plaid Link flow in the app.

## Docker

```bash
# Configure
cp .env.example .env
# Edit .env with your keys (see step 3 above)

# Run
docker compose up -d
```

The app runs at `http://localhost:3000`. Data persists in a Docker volume.

To update:

```bash
docker compose pull
docker compose up -d
```

## MCP Setup (AI Integration)

Ledgr includes a built-in MCP server so AI assistants can interact with your financial data.

### 1. Enable MCP

Add to your `.env`:

```env
MCP_ENABLED=true
LEDGR_URL=http://localhost:3000
```

### 2. Connect Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ledgr": {
      "url": "http://localhost:3000/api/mcp/sse"
    }
  }
}
```

### 3. Authorize

When Claude connects, you'll be redirected to Ledgr's OAuth flow to authorize access. Once approved, Claude can:

- "Show me my spending this month"
- "How much have I spent on dining out?"
- "What's my budget status?"
- "Show me my investment portfolio"
- "Sync my accounts"

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `list_accounts` | View linked bank accounts and balances |
| `list_transactions` | Search and filter transactions |
| `list_budgets` | Check budget progress |
| `list_categories` | View spending categories |
| `list_investments` | Portfolio holdings and performance |
| `generate_report` | Spending, income, and net worth reports |
| `list_recurring` | Recurring transactions and bills |
| `sync_accounts` | Trigger a bank sync |
| `show_dashboard` | Interactive financial dashboard |
| `manage_categories` | Create and update categories |

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| UI | shadcn/ui + Tailwind CSS 4 |
| Charts | Recharts 3 |
| Database | PostgreSQL 17 via Drizzle ORM |
| Auth | Better Auth |
| Bank Sync | Plaid Node SDK |
| AI | Vercel AI SDK (BYOK) |
| MCP | Model Context Protocol SDK |
| Testing | Vitest + Playwright + Stryker |

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/             # Login, signup
│   ├── (dashboard)/        # Main app pages
│   │   ├── accounts/       # Linked bank accounts
│   │   ├── transactions/   # Transaction list + filters
│   │   ├── budgets/        # Budget management
│   │   ├── bills/          # Recurring bills
│   │   ├── investments/    # Portfolio tracking
│   │   ├── reports/        # Financial reports
│   │   ├── import/         # CSV/OFX import
│   │   └── settings/       # App settings, AI keys
│   └── api/                # Plaid webhooks, MCP, health
├── components/             # UI components
├── db/schema/              # Drizzle schema (one file per domain)
├── lib/
│   ├── plaid/              # Plaid client + sync logic
│   ├── mcp/                # MCP server + tools
│   ├── categorization/     # Auto-categorization pipeline
│   ├── ai/                 # AI provider integration
│   └── auth/               # Auth config
├── actions/                # Server Actions (mutations)
└── queries/                # Server-side data fetching
```

## Development

```bash
pnpm dev                          # Dev server (Turbopack)
pnpm test                         # Unit + integration tests
pnpm test:watch                   # Watch mode
pnpm test:e2e                     # Playwright E2E tests
pnpm lint                         # ESLint
pnpm typecheck                    # Type checking
pnpm db:studio                    # Drizzle Studio (DB browser)
```

## Roadmap

- [ ] Mobile-responsive UI
- [ ] Plaid webhook support (real-time sync)
- [ ] Multi-currency support
- [ ] Custom report builder
- [ ] Transfer detection between accounts
- [ ] Goal tracking (savings goals, debt payoff)
- [ ] AI chat assistant (in-app)
- [ ] OFX/QFX import
- [ ] Recurring budget templates

See [Issues](https://github.com/KenTaniguchi-R/ledgr/issues) for what's being worked on.

## Security

Security is critical for a finance app. If you discover a vulnerability, **please do not open a public issue.** Instead, see [SECURITY.md](SECURITY.md) for responsible disclosure instructions.

## Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create your branch (`git checkout -b feat/my-feature`)
3. Commit your changes
4. Push and open a Pull Request

## License

[AGPL-3.0](LICENSE) — you can self-host freely. If you modify and distribute the server, you must open-source your changes.
