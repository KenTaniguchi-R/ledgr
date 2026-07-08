import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy · Ledgr",
  description: "How Ledgr collects, uses, and protects your personal data.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <article className="space-y-6 text-sm leading-6 text-foreground">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-muted-foreground">Last updated: July 8, 2026</p>
        </header>

        <p>
          Ledgr (&ldquo;Ledgr&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is a
          personal finance application that lets you securely connect your
          financial accounts to see your transactions, balances, budgets, net
          worth, and investment holdings in one place. This policy explains what
          data we collect, how we use it, who we share it with, and the choices
          and rights you have. For the hosted Ledgr service, <strong>we are the
          data controller</strong> for the personal data described below.
        </p>

        <section className="space-y-2">
          <h2 className="text-lg font-medium">Data we collect</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              <strong>Account information</strong> — your email address and an
              encrypted (hashed) password used to sign in.
            </li>
            <li>
              <strong>Financial account data (via Plaid)</strong> — when you
              connect a financial institution, we receive account details,
              balances, transactions, and (if you enable it) investment holdings
              and transactions.
            </li>
            <li>
              <strong>Usage and device data</strong> — basic technical
              information (e.g. session, IP address) needed to operate and secure
              the service.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-medium">How we use your data</h2>
          <p>
            We use your data only to provide and improve the service you signed
            up for: displaying your accounts, transactions, balances, budgets,
            net worth, and holdings; categorizing transactions and detecting
            recurring bills; and securing your account. We do <strong>not</strong>{" "}
            sell your personal data, and we do <strong>not</strong> use your
            financial data for advertising.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-medium">Legal basis and consent</h2>
          <p>
            We process your financial data to perform the service you request.
            You connect financial accounts only through Plaid Link, which
            presents the data being shared and obtains your consent before any
            account is linked.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-medium">Who we share data with</h2>
          <p>
            We share data only with service providers that help us run Ledgr,
            under confidentiality and security obligations:
          </p>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              <strong>Plaid</strong> connects your financial institutions and
              provides the account data. See Plaid&apos;s{" "}
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
              <strong>Hosting and database providers</strong> operate the
              infrastructure that stores your data, with encryption at rest.
            </li>
            <li>
              <strong>AI provider (optional)</strong> — if you enable AI-assisted
              categorization or chat, the relevant transaction data is sent to the
              configured LLM provider. This feature is off unless you enable it.
            </li>
          </ul>
          <p>
            We may also disclose data if required by law or to protect the rights
            and safety of our users and the service.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-medium">Security</h2>
          <p>
            We protect your data with encryption in transit (TLS 1.2+) and at
            rest. Plaid access tokens are additionally encrypted at the
            application layer (AES-256-GCM). Access to your data is isolated per
            user.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-medium">Data retention and deletion</h2>
          <p>
            We keep your data for as long as your account is active. At any time
            you can:
          </p>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              <strong>Delete your financial data</strong> — disconnects your
              institutions and erases your accounts, transactions, balances, and
              investment records.
            </li>
            <li>
              <strong>Delete your account</strong> — permanently erases your data
              and closes your account.
            </li>
          </ul>
          <p>
            When you delete an account or disconnect an institution, we revoke the
            associated Plaid access at Plaid.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-medium">Your rights</h2>
          <p>
            Depending on your location, you may have rights to access, correct,
            export, or delete your personal data, and to withdraw consent. Use the
            in-app controls or contact us to exercise these rights.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-medium">Contact</h2>
          <p>
            Questions or requests regarding this policy or your data:{" "}
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
