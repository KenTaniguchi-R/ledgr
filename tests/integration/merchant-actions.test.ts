import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createTestDb } from "./setup";
import { insertHousehold, insertMerchant, insertCategoryGroup, insertCategory } from "./helpers";
import { updateMerchantDefaultCategory } from "../../src/actions/merchants";
import { merchants } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import type { LedgrDb } from "../../src/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../src/lib/demo-mode", () => ({ guardDemoMode: vi.fn(() => null) }));

const mockUserId = "test-user-id";
let mockHouseholdId: string;
vi.mock("../../src/lib/auth/session", () => ({
  getHouseholdId: vi.fn(() => Promise.resolve(mockHouseholdId)),
  getSession: vi.fn(() => Promise.resolve({ user: { id: mockUserId } })),
}));

describe("updateMerchantDefaultCategory", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;
  let categoryId: string;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());

    const hh = await insertHousehold(db);
    mockHouseholdId = hh.householdId;
    const { groupId } = await insertCategoryGroup(db, hh.householdId);
    ({ categoryId } = await insertCategory(db, hh.householdId, groupId, { name: "Travel" }));
  });

  afterAll(async () => {
    await close();
  });

  it("sets the merchant's default category", async () => {
    const { merchantId } = await insertMerchant(db, mockHouseholdId);

    const result = await updateMerchantDefaultCategory(merchantId, categoryId, db);
    expect(result).toEqual({ success: true });

    const [row] = await db.select().from(merchants).where(eq(merchants.id, merchantId));
    expect(row!.categoryId).toBe(categoryId);
  });

  it("only updates merchants belonging to the session household", async () => {
    const { householdId: otherHouseholdId } = await insertHousehold(db, "Other");
    const { merchantId: otherMerchantId } = await insertMerchant(db, otherHouseholdId);

    const result = await updateMerchantDefaultCategory(otherMerchantId, categoryId, db);
    expect(result).toEqual({ error: "Merchant not found" });

    const [row] = await db.select().from(merchants).where(eq(merchants.id, otherMerchantId));
    expect(row!.categoryId).toBeNull();
  });

  it("returns an error for a nonexistent merchant", async () => {
    const result = await updateMerchantDefaultCategory("no-such-merchant", categoryId, db);
    expect(result).toEqual({ error: "Merchant not found" });
  });
});
