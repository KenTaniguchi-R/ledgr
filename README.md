<div align="center">

<img src="docs/images/logo.png" alt="Ledgr" width="120" />

# Ledgr

**Self-hostable personal finance app with Plaid bank sync. Ask Claude about your money via MCP.**

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

It also exposes a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server, so AI assistants like Claude can query your finances through natural conversation — from Claude Code, Claude Desktop, or any MCP client.

```
You: "How much did I spend on dining out last month?"
Claude: Based on your transactions, you spent $342.18 on dining out in April...
```

## Quick Start

Requires [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/).

```bash
git clone https://github.com/KenTaniguchi-R/ledgr.git
cd ledgr
cp .env.example .env
docker compose up -d
```

Visit `http://localhost:3000`, create an account, and start exploring.

> Secrets (`ENCRYPTION_KEY`, `AUTH_SECRET`) are auto-generated on first run if left blank. Add your Plaid keys to `.env` to enable bank sync — see [Connect Your Bank](#connect-your-bank) below.

## Connect to Claude (MCP)

Ledgr includes a built-in [MCP](https://modelcontextprotocol.io) server. Tell your AI agent:

> Add Ledgr as an MCP server at http://localhost:3000/api/mcp/sse using SSE transport.

This works in Claude Code, Cursor, Windsurf, and other MCP-capable agents. On first connection, Ledgr redirects you through an OAuth flow to authorize access.

<details>
<summary>Manual configuration (Claude Desktop, VS Code, etc.)</summary>

#### Claude Desktop

Add to your config file:

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

```json
{
  "mcpServers": {
    "ledgr": {
      "url": "http://localhost:3000/api/mcp/sse"
    }
  }
}
```

#### VS Code

Add to `.vscode/mcp.json` in your workspace, or open **Command Palette > MCP: Open User Configuration**:

```json
{
  "servers": {
    "ledgr": {
      "url": "http://localhost:3000/api/mcp/sse"
    }
  }
}
```

#### Other MCP Clients

Ledgr uses SSE transport. Point any MCP-compatible client to:

```
http://localhost:3000/api/mcp/sse
```

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

## Connect Your Bank

Plaid is what makes Ledgr powerful — automatic sync from 12,000+ banks, combined with MCP, means you can ask Claude about real transactions as they happen.

1. Sign up at [dashboard.plaid.com](https://dashboard.plaid.com/signup) and get your `client_id` and secret from [Developers > Keys](https://dashboard.plaid.com/developers/keys)
2. Add them to your `.env`:
   ```env
   PLAID_CLIENT_ID=your_client_id
   PLAID_SECRET=your_secret
   PLAID_ENV=production      # or sandbox for fake data
   ```
3. Restart: `docker compose restart`
4. In the app, go to **Accounts > Link Bank** to connect via Plaid

> Don't have Plaid keys yet? The app still works — you can import transactions via CSV and add Plaid later.

## Why Ledgr?

Most personal finance apps either lock your data in their cloud or require you to manually import CSVs. Ledgr is different:

- **Plaid + MCP** — the only open-source finance app that combines automatic bank sync (12,000+ banks) with an AI agent interface. Your transactions sync automatically, and you query them through Claude
- **Smart categorization** — four-tier pipeline (your rules > merchant defaults > Plaid categories > AI) that learns from your corrections
- **Self-hosted** — Docker Compose with PostgreSQL. Your financial data never leaves your server
- **Full-featured** — budgets, recurring bill detection, investment tracking, financial reports, CSV/OFX import, BYOK AI categorization

| | Ledgr | Actual Budget | Firefly III | Maybe |
|---|---|---|---|---|
| Automatic bank sync | Plaid | GoCardless (EU) | Spectre/GoCardless | Manual only |
| AI agent (MCP) | Yes | No | No | No |
| Database | PostgreSQL | SQLite | MySQL/Postgres | Postgres |
| Self-hostable | Yes | Yes | Yes | Yes |
| Investment tracking | Yes | No | No | Yes |

## Updating

```bash
docker compose pull
docker compose up -d
```

## Development

> **If you're trying to self-host Ledgr, use the [Quick Start](#quick-start) above.** The instructions below are for contributors.

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+
- Running PostgreSQL (or use `pnpm dev:db` to start one in Docker)

### Setup

```bash
git clone https://github.com/KenTaniguchi-R/ledgr.git
cd ledgr
pnpm install
cp .env.example .env        # edit with your Plaid keys if needed
pnpm db:setup               # generate + run migrations
pnpm dev                    # http://localhost:3000
```

### Commands

```bash
pnpm dev                          # Dev server (Turbopack)
pnpm test                         # Unit + integration tests
pnpm test:watch                   # Watch mode
pnpm test:e2e                     # Playwright E2E tests
pnpm lint                         # ESLint
pnpm typecheck                    # Type checking
pnpm db:studio                    # Drizzle Studio (DB browser)
```

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
