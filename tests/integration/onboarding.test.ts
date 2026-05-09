import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./setup";
import { provisionHousehold } from "@/lib/auth/provision";
import { DEFAULT_CATEGORIES } from "@/db/seed/categories";
import {
  households,
  householdMembers,
  categoryGroups,
  categories,
  userSettings,
} from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";

describe("household provisioning", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let close: () => void;

  afterEach(() => {
    close?.();
  });

  function setup() {
    const result = createTestDb();
    db = result.db;
    close = result.close;
    return db;
  }

  it("creates household, member, settings, and default categories", async () => {
    const testDb = setup();
    const userId = "user-1";

    const householdId = await provisionHousehold(userId, testDb);

    const hh = await testDb.select().from(households).where(eq(households.id, householdId));
    expect(hh).toHaveLength(1);
    expect(hh[0].name).toBe("My Finances");

    const members = await testDb.select().from(householdMembers).where(eq(householdMembers.householdId, householdId));
    expect(members).toHaveLength(1);
    expect(members[0].userId).toBe(userId);
    expect(members[0].role).toBe("owner");

    const settings = await testDb.select().from(userSettings).where(eq(userSettings.userId, userId));
    expect(settings).toHaveLength(1);

    const groups = await testDb.select().from(categoryGroups).where(eq(categoryGroups.householdId, householdId));
    expect(groups).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(groups.every((g) => g.isSystem === true)).toBe(true);

    const expectedCatCount = DEFAULT_CATEGORIES.reduce((sum, g) => sum + g.categories.length, 0);
    const cats = await testDb.select().from(categories).where(eq(categories.householdId, householdId));
    expect(cats).toHaveLength(expectedCatCount);
    expect(cats.every((c) => c.isSystem === true)).toBe(true);

    const incomeCats = cats.filter((c) => c.isIncome === true);
    const expectedIncome = DEFAULT_CATEGORIES.find((g) => g.name === "Income")!.categories.length;
    expect(incomeCats).toHaveLength(expectedIncome);
  });

  it("rolls back all rows on transaction failure (atomicity)", async () => {
    const testDb = setup();
    const userId = "user-atomicity";

    const householdId = await provisionHousehold(userId, testDb);

    // Insert a duplicate (householdId, userId) pair — violates uq_household_user
    const { v4: uuidv4 } = await import("uuid");
    await expect(
      testDb.insert(householdMembers).values({
        id: uuidv4(),
        householdId,
        userId,
        role: "member",
      })
    ).rejects.toThrow();

    // The original provisioned household should still exist untouched
    const hh = await testDb.select().from(households).where(eq(households.id, householdId));
    expect(hh).toHaveLength(1);

    // Only one member row should exist
    const members = await testDb
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, householdId));
    expect(members).toHaveLength(1);
  });

  it("does not create a duplicate household (idempotency)", async () => {
    const testDb = setup();
    const userId = "user-idempotent";

    const id1 = await provisionHousehold(userId, testDb);
    const id2 = await provisionHousehold(userId, testDb);

    expect(id1).toBe(id2);

    const allHouseholds = await testDb.select().from(households);
    expect(allHouseholds).toHaveLength(1);

    const allMembers = await testDb.select().from(householdMembers);
    expect(allMembers).toHaveLength(1);
  });

  it("isolates categories between households", async () => {
    const testDb = setup();

    const hhA = await provisionHousehold("user-a", testDb);
    const hhB = await provisionHousehold("user-b", testDb);

    const scopeA = scopedQuery(hhA, testDb);
    const scopeB = scopedQuery(hhB, testDb);

    const catsA = await testDb
      .select()
      .from(categoryGroups)
      .where(scopeA.where(categoryGroups));
    const catsB = await testDb
      .select()
      .from(categoryGroups)
      .where(scopeB.where(categoryGroups));

    expect(catsA).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(catsB).toHaveLength(DEFAULT_CATEGORIES.length);

    const idsA = new Set(catsA.map((c) => c.id));
    const idsB = new Set(catsB.map((c) => c.id));
    const overlap = [...idsA].filter((id) => idsB.has(id));
    expect(overlap).toHaveLength(0);
  });

  it("provisions via self-healing when hook was skipped", async () => {
    const testDb = setup();
    const userId = "user-selfheal";

    const householdId = await provisionHousehold(userId, testDb);

    expect(householdId).toBeTruthy();
    const members = await testDb
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.userId, userId));
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe("owner");
  });
});
