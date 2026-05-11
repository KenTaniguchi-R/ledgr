# Contributing to Ledgr

Thanks for your interest in contributing! This guide will help you get started.

## Getting Started

### Prerequisites

- Node.js 24+
- pnpm 10+
- Docker (for PostgreSQL)

### Setup

```bash
git clone https://github.com/KenTaniguchi-R/ledgr.git
cd ledgr
pnpm install
cp .env.example .env
pnpm dev:setup    # starts Postgres, runs migrations, starts dev server
```

### Environment Variables

Copy `.env.example` to `.env`. The app auto-generates secrets on first Docker run, but for local development you'll need to set at minimum:

- `DATABASE_URL` — Postgres connection string (the default works with `pnpm dev:db`)
- `PLAID_CLIENT_ID` / `PLAID_SECRET` — get these from the [Plaid Dashboard](https://dashboard.plaid.com) (sandbox is free)

## Development Workflow

1. **Create a branch** from `main`
2. **Make your changes**
3. **Run checks** before pushing:
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   ```
4. **Open a PR** against `main`

## Code Conventions

- **Money is always in cents** (integers). `$12.50` = `1250`. Never use floats for money.
- **All queries use `scopedQuery()`** for household isolation. Never write raw `WHERE household_id = ...`.
- **Colocate unit tests** next to source files (`foo.test.ts` beside `foo.ts`).
- **Integration tests** (requiring a database) go in `tests/integration/`.
- **TypeScript strict mode** is enabled. No `any` unless absolutely necessary.

## Project Structure

See the [README](README.md) for the full project structure and architecture overview.

## Reporting Issues

- **Bugs**: Use the [bug report template](https://github.com/KenTaniguchi-R/ledgr/issues/new?template=bug_report.yml)
- **Features**: Use the [feature request template](https://github.com/KenTaniguchi-R/ledgr/issues/new?template=feature_request.yml)
- **Questions**: Use [Discussions](https://github.com/KenTaniguchi-R/ledgr/discussions) or the [question template](https://github.com/KenTaniguchi-R/ledgr/issues/new?template=question.yml)

## License

By contributing, you agree that your contributions will be licensed under the [AGPLv3](LICENSE).
