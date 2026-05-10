import { describe, it, expect, vi, beforeEach } from "vitest";

describe("plaid client", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws if PLAID_CLIENT_ID is missing", async () => {
    vi.stubEnv("PLAID_CLIENT_ID", "");
    vi.stubEnv("PLAID_SECRET", "test-secret");
    vi.stubEnv("PLAID_ENV", "sandbox");

    const { getPlaidClient } = await import("./client");
    expect(() => getPlaidClient()).toThrow("PLAID_CLIENT_ID");
  });

  it("throws if PLAID_SECRET is missing", async () => {
    vi.stubEnv("PLAID_CLIENT_ID", "test-id");
    vi.stubEnv("PLAID_SECRET", "");
    vi.stubEnv("PLAID_ENV", "sandbox");

    const { getPlaidClient } = await import("./client");
    expect(() => getPlaidClient()).toThrow("PLAID_SECRET");
  });

  it("throws if PLAID_ENV is invalid", async () => {
    vi.stubEnv("PLAID_CLIENT_ID", "test-id");
    vi.stubEnv("PLAID_SECRET", "test-secret");
    vi.stubEnv("PLAID_ENV", "invalid");

    const { getPlaidClient } = await import("./client");
    expect(() => getPlaidClient()).toThrow("PLAID_ENV");
  });

  it("creates client for valid sandbox config", async () => {
    vi.stubEnv("PLAID_CLIENT_ID", "test-id");
    vi.stubEnv("PLAID_SECRET", "test-secret");
    vi.stubEnv("PLAID_ENV", "sandbox");

    const { getPlaidClient } = await import("./client");
    expect(getPlaidClient()).toBeDefined();
  });

  it("creates client for development config", async () => {
    vi.stubEnv("PLAID_CLIENT_ID", "test-id");
    vi.stubEnv("PLAID_SECRET", "test-secret");
    vi.stubEnv("PLAID_ENV", "development");

    const { getPlaidClient } = await import("./client");
    expect(getPlaidClient()).toBeDefined();
  });
});
