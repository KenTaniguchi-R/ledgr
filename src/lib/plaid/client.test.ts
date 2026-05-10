import { describe, it, expect, vi, beforeEach } from "vitest";

describe("plaid client", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws if PLAID_CLIENT_ID is missing", async () => {
    vi.stubEnv("PLAID_CLIENT_ID", "");
    vi.stubEnv("PLAID_SECRET", "test-secret");
    vi.stubEnv("PLAID_ENV", "sandbox");

    vi.resetModules();
    await expect(() => import("./client")).rejects.toThrow("PLAID_CLIENT_ID");
  });

  it("throws if PLAID_SECRET is missing", async () => {
    vi.stubEnv("PLAID_CLIENT_ID", "test-id");
    vi.stubEnv("PLAID_SECRET", "");
    vi.stubEnv("PLAID_ENV", "sandbox");

    vi.resetModules();
    await expect(() => import("./client")).rejects.toThrow("PLAID_SECRET");
  });

  it("throws if PLAID_ENV is invalid", async () => {
    vi.stubEnv("PLAID_CLIENT_ID", "test-id");
    vi.stubEnv("PLAID_SECRET", "test-secret");
    vi.stubEnv("PLAID_ENV", "invalid");

    vi.resetModules();
    await expect(() => import("./client")).rejects.toThrow("PLAID_ENV");
  });

  it("creates client for valid sandbox config", async () => {
    vi.stubEnv("PLAID_CLIENT_ID", "test-id");
    vi.stubEnv("PLAID_SECRET", "test-secret");
    vi.stubEnv("PLAID_ENV", "sandbox");

    vi.resetModules();
    const { plaidClient } = await import("./client");
    expect(plaidClient).toBeDefined();
  });
});
