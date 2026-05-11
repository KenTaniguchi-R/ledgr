import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./setup";
import { provisionHousehold } from "@/lib/auth/provision";
import { resolveHouseholdId } from "@/lib/auth/session";
import { DEFAULT_CATEGORIES } from "@/db/seed/categories";
import {
  households,
  householdMembers,
  categoryGroups,
  categories,
  userSettings,
} from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import type { LedgrDb } from "@/db";

describe("household provisioning", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  it("creates household, member, settings, and default categories", async () => {
    const userId = "user-1";

    const householdId = await provisionHousehold(userId, db);

    const hh = await db.select().from(households).where(eq(households.id, householdId));
    expect(hh).toHaveLength(1);
    expect(hh[0].name).toBe("My Finances");

    const members = await db.select().from(householdMembers).where(eq(householdMembers.householdId, householdId));
    expect(members).toHaveLength(1);
    expect(members[0].userId).toBe(userId);
    expect(members[0].role).toBe("owner");

    const settings = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    expect(settings).toHaveLength(1);

    const groups = await db.select().from(categoryGroups).where(eq(categoryGroups.householdId, householdId));
    expect(groups).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(groups.every((g) => g.isSystem === true)).toBe(true);

    const expectedCatCount = DEFAULT_CATEGORIES.reduce((sum, g) => sum + g.categories.length, 0);
    const cats = await db.select().from(categories).where(eq(categories.householdId, householdId));
    expect(cats).toHaveLength(expectedCatCount);
    expect(cats.every((c) => c.isSystem === true)).toBe(true);

    const incomeCats = cats.filter((c) => c.isIncome === true);
    const expectedIncome = DEFAULT_CATEGORIES.find((g) => g.name === "Income")!.categories.length;
    expect(incomeCats).toHaveLength(expectedIncome);
  });

  it("rolls back all rows on transaction failure (atomicity)", async () => {
    const userId = "user-atomicity";

    const householdId = await provisionHousehold(userId, db);

    const { v4: uuidv4 } = await import("uuid");
    await expect(
      db.insert(householdMembers).values({
        id: uuidv4(),
        householdId,
        userId,
        role: "member",
      })
    ).rejects.toThrow();

    const hh = await db.select().from(households).where(eq(households.id, householdId));
    expect(hh).toHaveLength(1);

    const members = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, householdId));
    expect(members).toHaveLength(1);
  });

  it("does not create a duplicate household (idempotency)", async () => {
    const userId = "user-idempotent";

    const id1 = await provisionHousehold(userId, db);
    const id2 = await provisionHousehold(userId, db);

    expect(id1).toBe(id2);

    const allHouseholds = await db.select().from(households);
    expect(allHouseholds.filter((h) => h.id === id1)).toHaveLength(1);

    const allMembers = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.userId, userId));
    expect(allMembers).toHaveLength(1);
  });

  it("isolates categories between households", async () => {
    const hhA = await provisionHousehold("user-a", db);
    const hhB = await provisionHousehold("user-b", db);

    const scopeA = scopedQuery(hhA, db);
    const scopeB = scopedQuery(hhB, db);

    const catsA = await db
      .select()
      .from(categoryGroups)
      .where(scopeA.where(categoryGroups));
    const catsB = await db
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
    const userId = "user-selfheal";

    const householdId = await provisionHousehold(userId, db);

    expect(householdId).toBeTruthy();
    const members = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.userId, userId));
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe("owner");
  });

  it("resolveHouseholdId returns existing household for provisioned user", async () => {
    const userId = "user-resolve-existing";

    const provisioned = await provisionHousehold(userId, db);
    const resolved = await resolveHouseholdId(userId, db);

    expect(resolved).toBe(provisioned);
  });

  it("resolveHouseholdId provisions when no household exists", async () => {
    const userId = "user-resolve-new";

    const resolved = await resolveHouseholdId(userId, db);

    expect(resolved).toBeTruthy();

    const members = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.userId, userId));
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe("owner");
  });
});
