import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { createTestDb } from "./setup";
import { insertHousehold, insertPlaidItem } from "./helpers";
import type { LedgrDb } from "../../src/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../src/lib/demo-mode", () => ({ guardDemoMode: vi.fn(() => null) }));

const mockUserId = "test-user-id";
let mockHouseholdId: string;
vi.mock("../../src/lib/auth/session", () => ({
  getHouseholdId: vi.fn(() => Promise.resolve(mockHouseholdId)),
  getSession: vi.fn(() => Promise.resolve({ user: { id: mockUserId } })),
}));

vi.mock("../../src/lib/plaid/sync", () => ({
  syncInstitution: vi.fn(() =>
    Promise.resolve({ success: true, addedCount: 0, modifiedCount: 0, removedCount: 0, syncedAt: new Date().toISOString() })
  ),
}));

vi.mock("../../src/lib/plaid/investments", () => ({
  syncInvestments: vi.fn(() => Promise.reject(new Error("investments API down"))),
}));

describe("triggerSync", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;
  let plaidItemId: string;

  beforeAll(async () => {
    vi.stubEnv("ENCRYPTION_KEY", "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2");
    ({ db, close } = await createTestDb());
    const hh = await insertHousehold(db);
    mockHouseholdId = hh.householdId;
    ({ plaidItemId } = await insertPlaidItem(db, hh.householdId));
  });

  afterAll(async () => {
    await close();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs investment sync failures instead of swallowing them", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { triggerSync } = await import("../../src/actions/sync");
    const result = await triggerSync(plaidItemId, db);

    expect(result.success).toBe(true);
    // The fire-and-forget investment sync rejects asynchronously; flush microtasks.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(errorSpy).toHaveBeenCalled();
    const loggedError = errorSpy.mock.calls.find((call) =>
      call.some((arg) => arg instanceof Error && arg.message === "investments API down")
    );
    expect(loggedError).toBeDefined();
  });
});
