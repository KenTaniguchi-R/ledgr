import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { LedgrDb } from "../../src/db";
import { getSpendingByCategory } from "../../src/queries/reports";
import {
  insertAccount,
  insertCategory,
  insertCategoryGroup,
  insertHousehold,
  insertTransaction,
  insertTransactionSplit,
} from "./helpers";
import { createTestDb } from "./setup";

// The range is passed explicitly, so fixed dates can't rot out of a window.
const RANGE = { dateFrom: "2026-09-01", dateTo: "2026-09-30" };

// The Spending tab and the MCP get_spending_by_category tool both go through
// aggregateSpending, which used to ignore filters.categoryIds while every
// other report query honoured it.
describe("getSpendingByCategory category filter", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  test("returns only the filtered categories", async () => {
    const { householdId } = await insertHousehold(db, "Filter");
    const { accountId } = await insertAccount(db, householdId);
    const { groupId } = await insertCategoryGroup(db, householdId);
    const food = await insertCategory(db, householdId, groupId, { name: "Food" });
    const travel = await insertCategory(db, householdId, groupId, { name: "Travel" });
    await insertTransaction(db, householdId, accountId, {
      date: "2026-09-02", normalizedAmount: -1100, amount: 1100, categoryId: food.categoryId,
    });
    await insertTransaction(db, householdId, accountId, {
      date: "2026-09-03", normalizedAmount: -2200, amount: 2200, categoryId: travel.categoryId,
    });

    const all = await getSpendingByCategory(householdId, RANGE, db);
    const filtered = await getSpendingByCategory(
      householdId, { ...RANGE, categoryIds: [food.categoryId] }, db,
    );

    expect(all.map((r) => r.total).sort((a, b) => a - b)).toEqual([1100, 2200]);
    expect(filtered).toEqual([
      expect.objectContaining({ categoryId: food.categoryId, total: 1100 }),
    ]);
  });

  test("filters split rows on the split's own category", async () => {
    const { householdId } = await insertHousehold(db, "Splits");
    const { accountId } = await insertAccount(db, householdId);
    const { groupId } = await insertCategoryGroup(db, householdId);
    const first = await insertCategory(db, householdId, groupId, { name: "First split" });
    const second = await insertCategory(db, householdId, groupId, { name: "Second split" });
    const parent = await insertTransaction(db, householdId, accountId, {
      date: "2026-09-15", normalizedAmount: -10000, amount: 10000, categoryId: first.categoryId,
    });
    await insertTransactionSplit(db, parent.transactionId, first.categoryId, 6000);
    await insertTransactionSplit(db, parent.transactionId, second.categoryId, 4000);

    const filtered = await getSpendingByCategory(
      householdId, { ...RANGE, categoryIds: [second.categoryId] }, db,
    );

    expect(filtered).toEqual([
      expect.objectContaining({ categoryId: second.categoryId, total: 4000 }),
    ]);
  });
});
