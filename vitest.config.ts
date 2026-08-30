import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
    globalSetup: ["./tests/global-setup.ts"],
    testTimeout: 30_000,
    // Integration hooks do strictly more work than the tests they set up:
    // `createTestDb()` in beforeEach provisions a fresh Postgres schema and
    // replays migrations. Vitest's hook default is 10s, so the heaviest step
    // had a budget 3x tighter than the assertions it feeds — and under any
    // runner contention it blew that budget and failed whole files with
    // "Hook timed out in 10000ms" rather than a real assertion.
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/lib/**", "src/actions/**", "src/queries/**"],
      exclude: ["**/*.test.ts", "src/db/schema/**"],
    },
  },
});
