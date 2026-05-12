<div align="center">

<img src="docs/images/logo.png" alt="Ledgr" width="120" />

# Ledgr

**Self-hostable personal finance app with automatic bank sync and AI agent support.**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED.svg)](https://www.docker.com/)
[![MCP](https://img.shields.io/badge/MCP-enabled-orange.svg)](https://modelcontextprotocol.io)

<img src="docs/images/hero.jpeg" alt="Ledgr Dashboard" width="800" />

</div>

---

Ledgr connects to your bank accounts through [Plaid](https://plaid.com), automatically syncs and categorizes transactions, and gives you budgets, investment tracking, bill detection, and financial reports — all running on your own server with your own data.

It also exposes an [MCP](https://modelcontextprotocol.io) server, so AI assistants like Claude can query your finances through natural conversation.

```
You: "How much did I spend on dining out last month?"
Claude: Based on your transactions, you spent $342.18 on dining out in April...
```

<div align="center">
<img src="docs/images/mcp-demo.png" alt="Ledgr MCP demo in Claude Code" width="800" />
<br />
<em>Querying your finances from Claude Code via MCP</em>
</div>

## Features

- **Automatic bank sync** — connect 12,000+ banks via Plaid, transactions sync automatically
- **Smart categorization** — four-tier pipeline: your rules > merchant defaults > Plaid categories > AI fallback
- **Budgets** — set monthly budgets by category, track progress in real time
- **Investment tracking** — portfolio holdings, performance history, and allocation breakdowns
- **Recurring bill detection** — automatically identifies subscriptions and recurring charges
- **Financial reports** — spending, income, net worth, and category trends over time
- **AI agent interface (MCP)** — query your finances from Claude Code, Claude Desktop, Cursor, or any MCP client
- **BYOK AI categorization** — bring your own API key (OpenAI, Anthropic, Google, or local models)
- **CSV/OFX import** — for accounts not supported by Plaid
- **Self-hosted** — Docker Compose with PostgreSQL, your data never leaves your server

## Quick Start

Requires [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/).

```bash
git clone https://github.com/KenTaniguchi-R/ledgr.git
cd ledgr
docker compose up -d
```

Visit `http://localhost:3000`, create an account, and start exploring.

> Secrets (`ENCRYPTION_KEY`, `AUTH_SECRET`) are auto-generated on first run if left blank. Add your Plaid keys to `.env` to enable bank sync — see [Connect Your Bank](#connect-your-bank) below.

## Connect Your Bank

1. Sign up at [dashboard.plaid.com](https://dashboard.plaid.com/signup) and get your `client_id` and secret from [Developers > Keys](https://dashboard.plaid.com/developers/keys)
2. Add them to your `.env`:
   ```env
   PLAID_CLIENT_ID=your_client_id
   PLAID_SECRET=your_secret
   PLAID_ENV=production      # or sandbox for fake data
   ```
3. Restart: `docker compose restart`
4. In the app, go to **Accounts > Link Bank** to connect via Plaid

> Don't have Plaid keys yet? The app still works — import transactions via CSV and add Plaid later.

<div align="center">
<img src="docs/images/plaid-link.jpeg" alt="Plaid Link bank connection" width="800" />
<br />
<em>Connect any of 12,000+ banks through Plaid</em>
</div>

## Connect to Claude

Install the Ledgr plugin for [Claude Code](https://docs.anthropic.com/en/docs/claude-code):

```bash
/plugin marketplace add KenTaniguchi-R/ledgr
/plugin install ledgr@ledgr
```

This installs the MCP server (with OAuth2 authentication) and finance skills like budget checks, savings analysis, and monthly reviews — all in one step.

Set the `LEDGR_URL` environment variable to point to your Ledgr instance:

```bash
# In your Claude Code settings or shell profile
export LEDGR_URL=http://localhost:3000
```

<details>
<summary>Other MCP clients (Claude Desktop, VS Code, Cursor, etc.)</summary>

Point any MCP-compatible client to your Ledgr instance using streamable HTTP transport:

```
http://localhost:3000/api/mcp
```

On first connection, Ledgr redirects you through an OAuth flow to authorize access.

</details>

### Available Tools

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

**Example prompts:**
- "How much did I spend on groceries this month?"
- "Show me my budget status"
- "What recurring bills do I have?"
- "Generate a spending report for Q1"
- "Sync my accounts and show my balances"

## Comparison

| | Ledgr | Actual Budget | Firefly III | Maybe Finance |
|---|:---:|:---:|:---:|:---:|
| Automatic bank sync | Plaid (12,000+ banks) | GoCardless (EU) | Spectre/GoCardless | -- |
| AI agent (MCP) | Yes | -- | -- | -- |
| AI categorization | Yes (BYOK) | -- | -- | -- |
| Investment tracking | Yes | -- | -- | Yes |
| Self-hostable | Yes | Yes | Yes | Yes |
| Database | PostgreSQL | SQLite | MySQL/Postgres | Postgres |
| License | AGPL-3.0 | MIT | AGPL-3.0 | AGPL-3.0 |

## Updating

```bash
docker compose pull
docker compose up -d
```

Migrations run automatically on container startup.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Host port for the app |
| `POSTGRES_PASSWORD` | `ledgr` | Database password (change in production) |
| `PLAID_CLIENT_ID` | -- | Plaid client ID |
| `PLAID_SECRET` | -- | Plaid secret key |
| `PLAID_ENV` | `production` | `production` or `sandbox` |
| `AI_PROVIDER` | -- | `openai`, `anthropic`, `google`, or `custom` |
| `AI_API_KEY` | -- | Provider API key for AI categorization |

See [`.env.example`](.env.example) for all options.

## Development

> **If you're self-hosting Ledgr, use the [Quick Start](#quick-start) above.** The instructions below are for contributors.

### Prerequisites

- [Node.js](https://nodejs.org/) 24+
- [pnpm](https://pnpm.io/) 10+
- PostgreSQL 18 (or `pnpm dev:db` to start one in Docker)

### Setup

```bash
git clone https://github.com/KenTaniguchi-R/ledgr.git
cd ledgr
pnpm install
cp .env.example .env
pnpm dev:setup              # Start DB + migrate + dev server
```

### Commands

```bash
pnpm dev                    # Dev server (Turbopack)
pnpm test                   # Unit + integration tests
pnpm test:e2e               # Playwright E2E tests
pnpm lint                   # ESLint
pnpm typecheck              # Type checking
pnpm db:studio              # Drizzle Studio (DB browser)
```

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| UI | shadcn/ui + Tailwind CSS 4 |
| Charts | Recharts 3 |
| Database | PostgreSQL 18 via Drizzle ORM |
| Auth | Better Auth |
| Bank Sync | Plaid Node SDK |
| AI | Vercel AI SDK (BYOK) |
| MCP | Model Context Protocol SDK |
| Testing | Vitest + Playwright + Stryker |

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
