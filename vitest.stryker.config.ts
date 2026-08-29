import { defineConfig } from "vitest/config";

// Vitest config used ONLY by Stryker (wired via stryker.config.json's
// `vitest.configFile`). It deliberately omits the `globalSetup` that starts a
// Postgres testcontainer.
//
// Why: Stryker runs vitest once per mutant batch across `concurrency` workers
// (default: CPU cores - 1). globalSetup fires on every one of those, so a
// Postgres container was being booted and fully migrated to run unit tests that
// take milliseconds — measured at 8.92s of setup for 29ms of tests, and 18
// concurrent containers observed on the runner.
//
// Consequence: tests that need a database can't run here, so the DB-backed
// files below are excluded along with tests/ (integration). Mutants covered
// only by those report as NoCoverage rather than Survived, which is honest
// signal about unit-test strength instead of a container tax.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: [
      "node_modules/**",
      "e2e/**",
      // Need a live Postgres via tests/global-setup.ts.
      "src/lib/demo-mode.test.ts",
      "src/lib/simplefin/queries.test.ts",
      "src/lib/plaid/queries.test.ts",
      "src/lib/jobs/backfill-balances.test.ts",
      "src/lib/jobs/backfill-transfers.test.ts",
    ],
    testTimeout: 30_000,
  },
});
