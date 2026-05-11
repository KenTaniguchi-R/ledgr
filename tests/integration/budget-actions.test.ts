import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq, and } from "drizzle-orm";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertCategoryGroup,
  insertCategory,
  insertBudget,
  insertBudgetCategory,
} from "./helpers";
import {
  createBudget,
  setBudgetCategory,
  removeBudgetCategory,
  copyBudgetFromMonth,
} from "../../src/actions/budgets";
import { budgetCategories } from "../../src/db/schema";
import type { LedgrDb } from "../../src/db";

// Mock auth + revalidation
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../src/lib/demo-mode", () => ({ guardDemoMode: vi.fn(() => null) }));

const mockUserId = "test-user-id";
let mockHouseholdId: string;
vi.mock("../../src/lib/auth/session", () => ({
  getHouseholdId: vi.fn(() => Promise.resolve(mockHouseholdId)),
  getSession: vi.fn(() => Promise.resolve({ user: { id: mockUserId } })),
}));

describe("budget actions", () => {
  let db: LedgrDb;
  let close: () => void;
  let categoryId1: string;
  let categoryId2: string;
  let otherHouseholdId: string;

  beforeAll(() => {
    const testDb = createTestDb();
    db = testDb.db;
    close = testDb.close;

    // Primary household
    const hh = insertHousehold(db);
    mockHouseholdId = hh.householdId;
    const { groupId } = insertCategoryGroup(db, hh.householdId);
    ({ categoryId: categoryId1 } = insertCategory(db, hh.householdId, groupId, { name: "Groceries" }));
    ({ categoryId: categoryId2 } = insertCategory(db, hh.householdId, groupId, { name: "Dining" }));

    // Second household for isolation tests
    const hh2 = insertHousehold(db, "Other Household");
    otherHouseholdId = hh2.householdId;
    const { groupId: groupId2 } = insertCategoryGroup(db, otherHouseholdId, { name: "Other Group" });
    insertCategory(db, otherHouseholdId, groupId2, { name: "Other Cat" });
  });

  afterAll(() => close());

  describe("createBudget", () => {
    it("creates a budget and returns same budgetId on repeat call (idempotent)", async () => {
      const result1 = await createBudget("2026-06", db);
      expect(result1).toHaveProperty("success", true);
      expect(result1).toHaveProperty("budgetId");

      const result2 = await createBudget("2026-06", db);
      expect(result2).toHaveProperty("success", true);
      expect((result2 as { success: true; budgetId: string }).budgetId).toBe(
        (result1 as { success: true; budgetId: string }).budgetId,
      );
    });
  });

  describe("setBudgetCategory", () => {
    it("upserts: insert then update same category = same row, new limitAmount", async () => {
      const { budgetId } = insertBudget(db, mockHouseholdId, { month: "2026-07" });

      // Insert
      const r1 = await setBudgetCategory(budgetId, categoryId1, 50000, db);
      expect(r1).toEqual({ success: true });

      const rows1 = db
        .select()
        .from(budgetCategories)
        .where(and(eq(budgetCategories.budgetId, budgetId), eq(budgetCategories.categoryId, categoryId1)))
        .all();
      expect(rows1).toHaveLength(1);
      expect(rows1[0].limitAmount).toBe(50000);

      // Update (upsert same category)
      const r2 = await setBudgetCategory(budgetId, categoryId1, 75000, db);
      expect(r2).toEqual({ success: true });

      const rows2 = db
        .select()
        .from(budgetCategories)
        .where(and(eq(budgetCategories.budgetId, budgetId), eq(budgetCategories.categoryId, categoryId1)))
        .all();
      expect(rows2).toHaveLength(1);
      expect(rows2[0].limitAmount).toBe(75000);
    });
  });

  describe("removeBudgetCategory", () => {
    it("deletes the budget category row", async () => {
      const { budgetId } = insertBudget(db, mockHouseholdId, { month: "2026-08" });
      insertBudgetCategory(db, budgetId, categoryId1, { limitAmount: 30000 });

      const r = await removeBudgetCategory(budgetId, categoryId1, db);
      expect(r).toEqual({ success: true });

      const remaining = db
        .select()
        .from(budgetCategories)
        .where(eq(budgetCategories.budgetId, budgetId))
        .all();
      expect(remaining).toHaveLength(0);
    });
  });

  describe("copyBudgetFromMonth", () => {
    it("copies category limits to new month and merges if target exists", async () => {
      // Source budget with two categories
      const { budgetId: srcId } = insertBudget(db, mockHouseholdId, { month: "2026-03" });
      insertBudgetCategory(db, srcId, categoryId1, { limitAmount: 40000 });
      insertBudgetCategory(db, srcId, categoryId2, { limitAmount: 20000 });

      // Target budget already has category1 with different limit
      const { budgetId: tgtId } = insertBudget(db, mockHouseholdId, { month: "2026-04" });
      insertBudgetCategory(db, tgtId, categoryId1, { limitAmount: 99999 });

      const r = await copyBudgetFromMonth("2026-03", "2026-04", db);
      expect(r).toHaveProperty("success", true);

      // category1 should keep original target limit (not overwritten)
      const cat1Row = db
        .select()
        .from(budgetCategories)
        .where(and(eq(budgetCategories.budgetId, tgtId), eq(budgetCategories.categoryId, categoryId1)))
        .get();
      expect(cat1Row!.limitAmount).toBe(99999);

      // category2 should be copied from source
      const cat2Row = db
        .select()
        .from(budgetCategories)
        .where(and(eq(budgetCategories.budgetId, tgtId), eq(budgetCategories.categoryId, categoryId2)))
        .get();
      expect(cat2Row!.limitAmount).toBe(20000);
    });
  });

  describe("household isolation", () => {
    it("setBudgetCategory rejects when budget belongs to another household", async () => {
      const { budgetId: otherBudgetId } = insertBudget(db, otherHouseholdId, { month: "2026-09" });

      const r = await setBudgetCategory(otherBudgetId, categoryId1, 10000, db);
      expect(r).toEqual({ error: "Budget not found" });
    });

    it("removeBudgetCategory rejects when budget belongs to another household", async () => {
      const { budgetId: otherBudgetId } = insertBudget(db, otherHouseholdId, { month: "2026-10" });

      const r = await removeBudgetCategory(otherBudgetId, categoryId1, db);
      expect(r).toEqual({ error: "Budget not found" });
    });
  });
});
