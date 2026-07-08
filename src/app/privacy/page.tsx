import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy · Ledgr",
  description:
    "How Ledgr, a self-hosted personal finance app, handles your data.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <article className="space-y-6 text-sm leading-6 text-foreground">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-muted-foreground">Last updated: July 7, 2026</p>
        </header>

        <p>
          Ledgr is open-source, self-hosted personal finance software. You run
          your own private instance on infrastructure you control. This page
          explains how Ledgr handles data so that you — the person deploying and
          using it — can act as an informed data controller.
        </p>

        <section className="space-y-2">
          <h2 className="text-lg font-medium">Who controls your data</h2>
          <p>
            In a self-hosted deployment, <strong>you are the data controller</strong>.
            Your financial data lives in your PostgreSQL database on your
            infrastructure. The Ledgr project and its maintainers do not receive,
            store, transmit, or have any access to your data. Ledgr does not phone
            home, and it contains no analytics or telemetry that reports your usage
            or financial information to any third party.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-medium">What data Ledgr stores</h2>
          <p>Within your own instance, Ledgr stores:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              <strong>Account credentials</strong> — your email address and a
              hashed password (via Better Auth).
            </li>
            <li>
              <strong>Financial data connected through Plaid</strong> — accounts,
              balances, transactions, and (if you enable it) investment holdings
              and investment transactions.
            </li>
            <li>
              <strong>Encrypted Plaid access tokens</strong> — encrypted at rest
              at the application layer (AES-256-GCM).
            </li>
          </ul>
          <p>All of this is stored only in the database you operate.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-medium">Third parties</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              <strong>Plaid</strong> connects your financial institutions and acts
              as a data processor for that connection. When you link an account,
              you consent through Plaid Link and Plaid&apos;s own terms apply. See
              Plaid&apos;s{" "}
              <a
                className="underline underline-offset-4"
                href="https://plaid.com/legal/#end-user-privacy-policy"
                target="_blank"
                rel="noreferrer"
              >
                End User Privacy Policy
              </a>
              .
            </li>
            <li>
              <strong>AI provider (optional, bring-your-own-key)</strong> — if you
              enable AI-assisted categorization or chat, the relevant transaction
              data is sent to the LLM provider whose API key you supply (e.g.
              OpenAI, Anthropic, Google). This is off unless you configure it.
            </li>
          </ul>
          <p>Ledgr integrates with no other third-party services by default.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-medium">Consent</h2>
          <p>
            Account connections are made only with your explicit consent through
            Plaid Link, which presents the data being shared before any account is
            linked.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-medium">Data retention and deletion</h2>
          <p>You control retention entirely. Within Ledgr you can:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              Disconnect a financial institution, which revokes the Plaid access
              token.
            </li>
            <li>
              Delete your data, including a full account deletion that removes your
              accounts, transactions, balances, and investment records from your
              database.
            </li>
          </ul>
          <p>
            Because you operate the database, you may also delete data directly at
            any time.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-medium">Security</h2>
          <p>
            Operators are responsible for deploying Ledgr behind HTTPS and for
            enabling encryption at rest on their database or host. To report a
            vulnerability, email the maintainer below.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-medium">Contact</h2>
          <p>
            Questions about this policy:{" "}
            <a
              className="underline underline-offset-4"
              href="mailto:taniguchi.ryusei@gmail.com"
            >
              taniguchi.ryusei@gmail.com
            </a>
            .
          </p>
        </section>

        <footer className="border-t pt-6 text-muted-foreground">
          <Link className="underline underline-offset-4" href="/">
            ← Back to Ledgr
          </Link>
        </footer>
      </article>
    </main>
  );
}
