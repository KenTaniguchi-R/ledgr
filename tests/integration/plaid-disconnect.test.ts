import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./setup";
import { server } from "../mocks/server";
import { accounts, plaidItems } from "@/db/schema";
import { disconnectPlaidItem } from "@/actions/plaid";
import { resetPlaidClient } from "@/lib/plaid/client";
import { insertHousehold, insertPlaidItem, insertAccount } from "./helpers";
import type { LedgrDb } from "@/db";

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(() => Promise.resolve({ user: { id: "test-user-id" } })),
  getHouseholdId: vi.fn(),
}));
vi.mock("@/lib/demo-mode", () => ({ guardDemoMode: vi.fn(() => null) }));

beforeAll(() => {
  vi.stubEnv("PLAID_CLIENT_ID", "test-id");
  vi.stubEnv("PLAID_SECRET", "test-secret");
  vi.stubEnv("PLAID_ENV", "sandbox");
  vi.stubEnv("ENCRYPTION_KEY", "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2");
  server.listen({ onUnhandledRequest: "bypass" });
});
afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

describe("disconnectPlaidItem", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;

  afterEach(async () => {
    server.resetHandlers();
    resetPlaidClient();
    await close?.();
  });

  it("preserves plaidAccountId on disconnect", async () => {
    ({ db, close } = await createTestDb());
    const { householdId } = await insertHousehold(db);
    const { plaidItemId } = await insertPlaidItem(db, householdId);
    await insertAccount(db, householdId, {
      plaidItemId,
      plaidAccountId: "plaid-acc-checking-123",
    });
    await insertAccount(db, householdId, {
      plaidItemId,
      plaidAccountId: "plaid-acc-savings-456",
    });

    const { getHouseholdId } = await import("@/lib/auth/session");
    vi.mocked(getHouseholdId).mockResolvedValue(householdId);

    await disconnectPlaidItem(plaidItemId, db);

    const accts = await db.select().from(accounts).where(eq(accounts.householdId, householdId));
    expect(accts).toHaveLength(2);

    for (const acct of accts) {
      expect(acct.deletedAt).not.toBeNull();
      expect(acct.plaidItemId).toBeNull();
      expect(acct.plaidAccountId).not.toBeNull();
    }

    expect(accts.map((a) => a.plaidAccountId).sort()).toEqual([
      "plaid-acc-checking-123",
      "plaid-acc-savings-456",
    ]);
  });

  it("hard-deletes the plaidItems row", async () => {
    ({ db, close } = await createTestDb());
    const { householdId } = await insertHousehold(db);
    const { plaidItemId } = await insertPlaidItem(db, householdId);
    await insertAccount(db, householdId, { plaidItemId });

    const { getHouseholdId } = await import("@/lib/auth/session");
    vi.mocked(getHouseholdId).mockResolvedValue(householdId);

    await disconnectPlaidItem(plaidItemId, db);

    const items = await db.select().from(plaidItems).where(eq(plaidItems.id, plaidItemId));
    expect(items).toHaveLength(0);
  });
});
