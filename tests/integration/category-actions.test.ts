import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./setup";
import {
  insertAccount,
  insertCategory,
  insertCategoryGroup,
  insertHousehold,
  insertTransaction,
} from "./helpers";
import {
  createCategoryGroupScoped,
  createCategoryScoped,
  deleteCategoryGroupScoped,
  deleteCategoryScoped,
  renameCategoryGroupScoped,
  renameCategoryScoped,
} from "../../src/actions/categories";
import { categories, categoryGroups } from "../../src/db/schema";
import type { LedgrDb } from "../../src/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("category actions", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;
  let householdId: string;
  let otherHouseholdId: string;
  let accountId: string;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    ({ householdId } = await insertHousehold(db, "Primary"));
    ({ householdId: otherHouseholdId } = await insertHousehold(db, "Other"));
    ({ accountId } = await insertAccount(db, householdId));
  });

  afterAll(async () => {
    await close();
  });

  it("creates custom groups and categories in the requested household", async () => {
    const groupResult = await createCategoryGroupScoped(householdId, "  Family  ", db);
    expect(groupResult).toHaveProperty("id");
    if (!("id" in groupResult)) throw new Error(groupResult.error);

    const categoryResult = await createCategoryScoped(
      householdId,
      { groupId: groupResult.id, name: "Childcare", isIncome: false },
      db,
    );
    expect(categoryResult).toHaveProperty("id");
    if (!("id" in categoryResult)) throw new Error(categoryResult.error);

    const [group] = await db
      .select()
      .from(categoryGroups)
      .where(eq(categoryGroups.id, groupResult.id));
    const [category] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, categoryResult.id));

    expect(group).toMatchObject({ householdId, name: "Family", isSystem: false });
    expect(category).toMatchObject({
      householdId,
      groupId: groupResult.id,
      name: "Childcare",
      isSystem: false,
    });
  });

  it("will not create a category in another household's group", async () => {
    const { groupId } = await insertCategoryGroup(db, otherHouseholdId);

    const result = await createCategoryScoped(
      householdId,
      { groupId, name: "Not Mine", isIncome: false },
      db,
    );

    expect(result).toEqual({ error: "Category group not found." });
  });

  it("renames custom records but protects system and other-household records", async () => {
    const { groupId } = await insertCategoryGroup(db, householdId, { name: "Old Group" });
    const { categoryId } = await insertCategory(db, householdId, groupId, { name: "Old Category" });
    const { groupId: systemGroupId } = await insertCategoryGroup(db, householdId, {
      name: "System Group",
      isSystem: true,
    });
    const { categoryId: systemCategoryId } = await insertCategory(
      db,
      householdId,
      systemGroupId,
      { name: "System Category", isSystem: true },
    );
    const { groupId: otherGroupId } = await insertCategoryGroup(db, otherHouseholdId);

    expect(await renameCategoryGroupScoped(householdId, groupId, "New Group", db)).toEqual({
      success: true,
    });
    expect(await renameCategoryScoped(householdId, categoryId, "New Category", db)).toEqual({
      success: true,
    });
    expect(await renameCategoryGroupScoped(householdId, systemGroupId, "Changed", db)).toHaveProperty(
      "error",
    );
    expect(
      await renameCategoryScoped(householdId, systemCategoryId, "Changed", db),
    ).toHaveProperty("error");
    expect(await renameCategoryGroupScoped(householdId, otherGroupId, "Changed", db)).toHaveProperty(
      "error",
    );
  });

  it("deletes an unused custom category but refuses one referenced by a transaction", async () => {
    const { groupId } = await insertCategoryGroup(db, householdId);
    const { categoryId: unusedId } = await insertCategory(db, householdId, groupId, {
      name: "Unused",
    });
    const { categoryId: usedId } = await insertCategory(db, householdId, groupId, {
      name: "Used",
    });
    await insertTransaction(db, householdId, accountId, { categoryId: usedId });

    expect(await deleteCategoryScoped(householdId, usedId, db)).toEqual({
      error: "This category is in use and cannot be deleted.",
    });
    expect(await deleteCategoryScoped(householdId, unusedId, db)).toEqual({ success: true });

    const deleted = await db.select().from(categories).where(eq(categories.id, unusedId));
    expect(deleted).toHaveLength(0);
  });

  it("deletes only empty custom groups", async () => {
    const { groupId } = await insertCategoryGroup(db, householdId, { name: "Custom Group" });
    const { categoryId } = await insertCategory(db, householdId, groupId);
    const { groupId: systemGroupId } = await insertCategoryGroup(db, householdId, {
      isSystem: true,
    });

    expect(await deleteCategoryGroupScoped(householdId, groupId, db)).toEqual({
      error: "Delete or move the categories in this group first.",
    });
    expect(await deleteCategoryGroupScoped(householdId, systemGroupId, db)).toEqual({
      error: "System category groups cannot be deleted.",
    });

    expect(await deleteCategoryScoped(householdId, categoryId, db)).toEqual({ success: true });
    expect(await deleteCategoryGroupScoped(householdId, groupId, db)).toEqual({ success: true });
  });
});
