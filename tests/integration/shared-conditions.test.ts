import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertCategoryGroup,
  insertCategory,
  insertTransaction,
} from "./helpers";
import { getIncomeCategoryIds, notIncome } from "../../src/queries/shared-conditions";
import type { LedgrDb } from "../../src/db";

let db: LedgrDb;
let close: () => Promise<void>;
let householdA: string;
let householdB: string;
let aIncomeCatId: string;
let bIncomeCatId: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());

  ({ householdId: householdA } = await insertHousehold(db, "Household A"));
  ({ householdId: householdB } = await insertHousehold(db, "Household B"));

  const aGroup = await insertCategoryGroup(db, householdA, { name: "Income" });
  ({ categoryId: aIncomeCatId } = await insertCategory(db, householdA, aGroup.groupId, {
    name: "Salary",
    isIncome: true,
  }));

  const bGroup = await insertCategoryGroup(db, householdB, { name: "Income" });
  ({ categoryId: bIncomeCatId } = await insertCategory(db, householdB, bGroup.groupId, {
    name: "Freelance",
    isIncome: true,
  }));
});

afterEach(async () => {
  await close();
});

describe("getIncomeCategoryIds", () => {
  test("returns only the caller household's income category ids", async () => {
    const ids = await getIncomeCategoryIds(householdA, db);
    expect(ids.has(aIncomeCatId)).toBe(true);
    expect(ids.has(bIncomeCatId)).toBe(false);
  });

  test("scopes correctly for the other household too", async () => {
    const ids = await getIncomeCategoryIds(householdB, db);
    expect(ids.has(bIncomeCatId)).toBe(true);
    expect(ids.has(aIncomeCatId)).toBe(false);
  });
});

describe("notIncome", () => {
  test("excludes only the caller household's income category, not another household's", async () => {
    const { accountId } = await insertAccount(db, householdA);
    const { transactionId: incomeTxnId } = await insertTransaction(db, householdA, accountId, {
      categoryId: aIncomeCatId,
      normalizedAmount: 500000,
      amount: -500000,
    });
    const { transactionId: expenseTxnId } = await insertTransaction(db, householdA, accountId, {
      categoryId: null,
      normalizedAmount: -2000,
      amount: 2000,
    });

    const condition = await notIncome(householdA, db);
    const { transactions } = await import("../../src/db/schema");
    const { and, eq } = await import("drizzle-orm");

    const rows = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.householdId, householdA), condition));

    const ids = rows.map((r) => r.id);
    expect(ids).toContain(expenseTxnId);
    expect(ids).not.toContain(incomeTxnId);
  });
});
