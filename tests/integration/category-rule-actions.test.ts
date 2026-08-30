import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createTestDb } from "./setup";
import { insertHousehold, insertCategoryGroup, insertCategory } from "./helpers";
import {
  createCategoryRule,
  updateCategoryRule,
  deleteCategoryRule,
} from "../../src/actions/category-rules";
import { getCategoryRules } from "../../src/queries/category-rules";
import { categoryRules } from "../../src/db/schema";
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

describe("category rule actions", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;
  let categoryId: string;
  let otherCategoryId: string;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());

    const hh = await insertHousehold(db);
    mockHouseholdId = hh.householdId;
    const { groupId } = await insertCategoryGroup(db, hh.householdId);
    ({ categoryId } = await insertCategory(db, hh.householdId, groupId, { name: "Subscriptions" }));
    ({ categoryId: otherCategoryId } = await insertCategory(db, hh.householdId, groupId, {
      name: "Groceries",
    }));
  });

  afterAll(async () => {
    await close();
  });

  describe("createCategoryRule", () => {
    it("creates a rule the engine can load", async () => {
      const result = await createCategoryRule(
        { categoryId, matchField: "name", matchPattern: "twitterapi", priority: 10 },
        db,
      );

      expect(result).toMatchObject({ success: true });
      const [row] = await db
        .select()
        .from(categoryRules)
        .where(eq(categoryRules.matchPattern, "twitterapi"));
      expect(row!.categoryId).toBe(categoryId);
      expect(row!.matchField).toBe("name");
      expect(row!.priority).toBe(10);
      expect(row!.householdId).toBe(mockHouseholdId);
    });

    it("trims the pattern, so a stray space cannot stop a rule matching", async () => {
      await createCategoryRule(
        { categoryId, matchField: "name", matchPattern: "  spotify  ", priority: 0 },
        db,
      );

      const [row] = await db
        .select()
        .from(categoryRules)
        .where(eq(categoryRules.categoryId, categoryId));
      const patterns = (
        await db.select().from(categoryRules).where(eq(categoryRules.householdId, mockHouseholdId))
      ).map((r) => r.matchPattern);
      expect(patterns).toContain("spotify");
      expect(row).toBeDefined();
    });

    it("rejects an empty pattern rather than creating a rule that matches everything", async () => {
      // The engine does target.includes(pattern); an empty string is true for
      // every transaction, so a blank rule would swallow the whole feed.
      const result = await createCategoryRule(
        { categoryId, matchField: "name", matchPattern: "   ", priority: 0 },
        db,
      );

      expect(result).toMatchObject({ error: expect.any(String) });
    });

    it("rejects a category belonging to another household", async () => {
      const other = await insertHousehold(db);
      const { groupId } = await insertCategoryGroup(db, other.householdId);
      const foreign = await insertCategory(db, other.householdId, groupId, { name: "Foreign" });

      const result = await createCategoryRule(
        { categoryId: foreign.categoryId, matchField: "name", matchPattern: "leak", priority: 0 },
        db,
      );

      expect(result).toMatchObject({ error: expect.any(String) });
      const rows = await db
        .select()
        .from(categoryRules)
        .where(eq(categoryRules.matchPattern, "leak"));
      expect(rows).toHaveLength(0);
    });
  });

  describe("updateCategoryRule", () => {
    it("changes the pattern, field, category and priority", async () => {
      await createCategoryRule(
        { categoryId, matchField: "name", matchPattern: "before", priority: 1 },
        db,
      );
      const [created] = await db
        .select()
        .from(categoryRules)
        .where(eq(categoryRules.matchPattern, "before"));

      const result = await updateCategoryRule(
        {
          id: created!.id,
          categoryId: otherCategoryId,
          matchField: "merchant",
          matchPattern: "after",
          priority: 99,
        },
        db,
      );

      expect(result).toMatchObject({ success: true });
      const [row] = await db.select().from(categoryRules).where(eq(categoryRules.id, created!.id));
      expect(row!.matchPattern).toBe("after");
      expect(row!.matchField).toBe("merchant");
      expect(row!.categoryId).toBe(otherCategoryId);
      expect(row!.priority).toBe(99);
    });

    it("will not update a rule belonging to another household", async () => {
      const other = await insertHousehold(db);
      const { groupId } = await insertCategoryGroup(db, other.householdId);
      const foreignCat = await insertCategory(db, other.householdId, groupId, { name: "Theirs" });
      const foreignRuleId = crypto.randomUUID();
      await db.insert(categoryRules).values({
        id: foreignRuleId,
        householdId: other.householdId,
        categoryId: foreignCat.categoryId,
        matchField: "name",
        matchPattern: "theirs",
        priority: 0,
      });

      const result = await updateCategoryRule(
        {
          id: foreignRuleId,
          categoryId,
          matchField: "name",
          matchPattern: "hijacked",
          priority: 0,
        },
        db,
      );

      expect(result).toMatchObject({ error: expect.any(String) });
      const [row] = await db.select().from(categoryRules).where(eq(categoryRules.id, foreignRuleId));
      expect(row!.matchPattern).toBe("theirs");
    });
  });

  describe("deleteCategoryRule", () => {
    it("removes the rule", async () => {
      await createCategoryRule(
        { categoryId, matchField: "name", matchPattern: "doomed", priority: 0 },
        db,
      );
      const [created] = await db
        .select()
        .from(categoryRules)
        .where(eq(categoryRules.matchPattern, "doomed"));

      const result = await deleteCategoryRule(created!.id, db);

      expect(result).toMatchObject({ success: true });
      const rows = await db.select().from(categoryRules).where(eq(categoryRules.id, created!.id));
      expect(rows).toHaveLength(0);
    });

    it("will not delete a rule belonging to another household", async () => {
      const other = await insertHousehold(db);
      const { groupId } = await insertCategoryGroup(db, other.householdId);
      const foreignCat = await insertCategory(db, other.householdId, groupId, { name: "Safe" });
      const foreignRuleId = crypto.randomUUID();
      await db.insert(categoryRules).values({
        id: foreignRuleId,
        householdId: other.householdId,
        categoryId: foreignCat.categoryId,
        matchField: "name",
        matchPattern: "survives",
        priority: 0,
      });

      const result = await deleteCategoryRule(foreignRuleId, db);

      expect(result).toMatchObject({ error: expect.any(String) });
      const rows = await db.select().from(categoryRules).where(eq(categoryRules.id, foreignRuleId));
      expect(rows).toHaveLength(1);
    });
  });

  describe("getCategoryRules", () => {
    it("returns rules in the order the engine evaluates them, highest priority first", async () => {
      const hh = await insertHousehold(db);
      const { groupId } = await insertCategoryGroup(db, hh.householdId);
      const cat = await insertCategory(db, hh.householdId, groupId, { name: "Ordered" });
      for (const [pattern, priority] of [["low", 1], ["high", 100], ["mid", 50]] as const) {
        await db.insert(categoryRules).values({
          id: crypto.randomUUID(),
          householdId: hh.householdId,
          categoryId: cat.categoryId,
          matchField: "name",
          matchPattern: pattern,
          priority,
        });
      }

      const rules = await getCategoryRules(hh.householdId, db);

      expect(rules.map((r) => r.matchPattern)).toEqual(["high", "mid", "low"]);
    });

    it("includes the target category name, so the list need not re-query", async () => {
      const hh = await insertHousehold(db);
      const { groupId } = await insertCategoryGroup(db, hh.householdId);
      const cat = await insertCategory(db, hh.householdId, groupId, { name: "Coffee Shops" });
      await db.insert(categoryRules).values({
        id: crypto.randomUUID(),
        householdId: hh.householdId,
        categoryId: cat.categoryId,
        matchField: "name",
        matchPattern: "blue bottle",
        priority: 0,
      });

      const [rule] = await getCategoryRules(hh.householdId, db);

      expect(rule.categoryName).toBe("Coffee Shops");
    });

    it("does not return another household's rules", async () => {
      const mine = await insertHousehold(db);
      const theirs = await insertHousehold(db);
      const { groupId } = await insertCategoryGroup(db, theirs.householdId);
      const cat = await insertCategory(db, theirs.householdId, groupId, { name: "Hidden" });
      await db.insert(categoryRules).values({
        id: crypto.randomUUID(),
        householdId: theirs.householdId,
        categoryId: cat.categoryId,
        matchField: "name",
        matchPattern: "secret",
        priority: 0,
      });

      const rules = await getCategoryRules(mine.householdId, db);

      expect(rules).toHaveLength(0);
    });
  });
});
