# Privacy Policy

_Last updated: 2026-07-07_

Ledgr is **open-source, self-hosted personal finance software**. You run your own
private instance on infrastructure you control. This document explains how Ledgr
handles data so that you — the person deploying and using it — can act as an informed
data controller.

## Who controls your data

In a self-hosted deployment, **you are the data controller.** Your financial data lives
in **your** PostgreSQL database on **your** infrastructure. The Ledgr project and its
maintainers **do not receive, store, transmit, or have any access to your data.** Ledgr
does not phone home, and it contains no analytics or telemetry that reports your usage or
financial information to any third party.

## What data Ledgr stores

Within your own instance, Ledgr stores:

- **Account credentials** — your email address and a hashed password (via Better Auth).
- **Financial data connected through Plaid** — accounts, balances, transactions, and (if
  you enable it) investment holdings and investment transactions.
- **Encrypted Plaid access tokens** — encrypted at rest at the application layer
  (AES-256-GCM). See [SECURITY.md](./SECURITY.md).

All of this is stored **only** in the database you operate.

## Third parties

- **Plaid** connects your financial institutions and acts as a data processor for that
  connection. When you link an account, you consent through Plaid Link and Plaid's own
  terms and privacy policy apply to their processing. See Plaid's
  [End User Privacy Policy](https://plaid.com/legal/#end-user-privacy-policy).
- **AI provider (optional, BYOK)** — if you enable AI-assisted categorization or chat, the
  relevant transaction data is sent to the LLM provider whose API key **you** supply
  (e.g. OpenAI, Anthropic, Google). This is off unless you configure it, and their privacy
  terms apply to that processing.

Ledgr integrates with no other third-party services by default.

## Consent

Account connections are made only with your explicit consent through Plaid Link, which
presents the data being shared before any account is linked.

## Data retention and deletion

You control retention entirely. Within Ledgr you can:

- **Disconnect a financial institution**, which revokes the Plaid access token.
- **Delete your data**, including a full account deletion that removes your accounts,
  transactions, balances, and investment records from your database.

Because you operate the database, you may also delete data directly at any time.

## Security

For the security architecture and how to report a vulnerability, see
[SECURITY.md](./SECURITY.md). Operators are responsible for deploying Ledgr behind HTTPS
and for enabling encryption at rest on their database or host.

## Contact

Questions about this policy: **taniguchi.ryusei@gmail.com**.
