import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { LedgrDb } from "../../src/db";
import { transactions } from "../../src/db/schema";
import { getToolSpendingSummary } from "../../src/queries/reports";
import {
  insertAccount,
  insertCategory,
  insertCategoryGroup,
  insertHousehold,
  insertTransaction,
  insertTransactionSplit,
} from "./helpers";
import { createTestDb } from "./setup";

const RANGE = { dateFrom: "2026-09-01", dateTo: "2026-09-30" };

describe("getToolSpendingSummary", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  test("uses Spending report semantics for household scope and transaction visibility", async () => {
    const { householdId } = await insertHousehold(db, "Active");
    const { accountId } = await insertAccount(db, householdId);
    const { groupId } = await insertCategoryGroup(db, householdId, { name: "Living" });
    const { categoryId: ordinaryId } = await insertCategory(db, householdId, groupId, {
      name: "Ordinary",
    });
    const { categoryId: includedTransferId } = await insertCategory(db, householdId, groupId, {
      name: "Included transfer",
      includeTransferInSpending: true,
    });
    const { categoryId: excludedTransferId } = await insertCategory(db, householdId, groupId, {
      name: "Excluded transfer",
      includeTransferInSpending: false,
      includeTransferInCashFlow: true,
    });

    await insertTransaction(db, householdId, accountId, {
      date: "2026-09-02",
      normalizedAmount: -1000,
      amount: 1000,
      categoryId: ordinaryId,
      name: "Ordinary expense",
    });
    await insertTransaction(db, householdId, accountId, {
      date: "2026-09-03",
      normalizedAmount: -2000,
      amount: 2000,
      categoryId: ordinaryId,
      name: "Internal transfer",
      isTransfer: true,
    });
    await insertTransaction(db, householdId, accountId, {
      date: "2026-09-04",
      normalizedAmount: 3000,
      amount: -3000,
      categoryId: includedTransferId,
      name: "Positive transfer",
      isTransfer: true,
    });
    await insertTransaction(db, householdId, accountId, {
      date: "2026-09-05",
      normalizedAmount: -4000,
      amount: 4000,
      categoryId: includedTransferId,
      name: "Opted-in transfer",
      isTransfer: true,
    });
    await insertTransaction(db, householdId, accountId, {
      date: "2026-09-06",
      normalizedAmount: -5000,
      amount: 5000,
      categoryId: excludedTransferId,
      name: "Cash-flow-only transfer",
      isTransfer: true,
    });
    await insertTransaction(db, householdId, accountId, {
      date: "2026-09-07",
      normalizedAmount: -6000,
      amount: 6000,
      categoryId: ordinaryId,
      name: "Hidden",
      isHidden: true,
    });
    await insertTransaction(db, householdId, accountId, {
      date: "2026-09-08",
      normalizedAmount: -7000,
      amount: 7000,
      categoryId: ordinaryId,
      name: "Deleted",
      deletedAt: new Date(),
    });
    await insertTransaction(db, householdId, accountId, {
      date: "2026-09-09",
      normalizedAmount: -8000,
      amount: 8000,
      categoryId: ordinaryId,
      name: "Pending",
      pending: true,
    });

    const other = await insertHousehold(db, "Other");
    const otherAccount = await insertAccount(db, other.householdId);
    const otherGroup = await insertCategoryGroup(db, other.householdId);
    const otherCategory = await insertCategory(db, other.householdId, otherGroup.groupId);
    await insertTransaction(db, other.householdId, otherAccount.accountId, {
      date: "2026-09-10",
      normalizedAmount: -9000,
      amount: 9000,
      categoryId: otherCategory.categoryId,
      name: "Other household",
    });

    const result = await getToolSpendingSummary(householdId, RANGE, db);

    expect(result.categories).toEqual([
      {
        categoryId: includedTransferId,
        categoryName: "Included transfer",
        groupName: "Living",
        amountCents: 4000,
      },
      {
        categoryId: ordinaryId,
        categoryName: "Ordinary",
        groupName: "Living",
        amountCents: 1000,
      },
    ]);
    expect(result.totalSpendingCents).toBe(5000);
  });

  test("applies account, category, and date filters", async () => {
    const { householdId } = await insertHousehold(db, "Filters");
    const firstAccount = await insertAccount(db, householdId, { name: "First" });
    const secondAccount = await insertAccount(db, householdId, { name: "Second" });
    const { groupId } = await insertCategoryGroup(db, householdId);
    const firstCategory = await insertCategory(db, householdId, groupId, { name: "First" });
    const secondCategory = await insertCategory(db, householdId, groupId, { name: "Second" });

    await insertTransaction(db, householdId, firstAccount.accountId, {
      date: "2026-09-10",
      normalizedAmount: -1100,
      amount: 1100,
      categoryId: firstCategory.categoryId,
    });
    await insertTransaction(db, householdId, secondAccount.accountId, {
      date: "2026-09-10",
      normalizedAmount: -2200,
      amount: 2200,
      categoryId: firstCategory.categoryId,
    });
    await insertTransaction(db, householdId, firstAccount.accountId, {
      date: "2026-09-10",
      normalizedAmount: -3300,
      amount: 3300,
      categoryId: secondCategory.categoryId,
    });
    await insertTransaction(db, householdId, firstAccount.accountId, {
      date: "2026-08-31",
      normalizedAmount: -4400,
      amount: 4400,
      categoryId: firstCategory.categoryId,
    });

    const result = await getToolSpendingSummary(
      householdId,
      {
        ...RANGE,
        accountIds: [firstAccount.accountId],
        categoryIds: [firstCategory.categoryId],
      },
      db,
    );

    expect(result.categories).toEqual([
      expect.objectContaining({ categoryId: firstCategory.categoryId, amountCents: 1100 }),
    ]);
    expect(result.totalSpendingCents).toBe(1100);
  });

  test("attributes split spending once and filters on split categories", async () => {
    const { householdId } = await insertHousehold(db, "Splits");
    const { accountId } = await insertAccount(db, householdId);
    const { groupId } = await insertCategoryGroup(db, householdId);
    const firstCategory = await insertCategory(db, householdId, groupId, { name: "First split" });
    const secondCategory = await insertCategory(db, householdId, groupId, { name: "Second split" });
    const parent = await insertTransaction(db, householdId, accountId, {
      date: "2026-09-15",
      normalizedAmount: -10000,
      amount: 10000,
      categoryId: firstCategory.categoryId,
      name: "Split parent",
    });
    await insertTransactionSplit(db, parent.transactionId, firstCategory.categoryId, 6000);
    await insertTransactionSplit(db, parent.transactionId, secondCategory.categoryId, 4000);

    const all = await getToolSpendingSummary(householdId, RANGE, db);
    const filtered = await getToolSpendingSummary(
      householdId,
      { ...RANGE, categoryIds: [secondCategory.categoryId] },
      db,
    );

    expect(all.totalSpendingCents).toBe(10000);
    expect(all.categories.map((row) => row.amountCents)).toEqual([6000, 4000]);
    expect(filtered.categories).toEqual([
      expect.objectContaining({ categoryId: secondCategory.categoryId, amountCents: 4000 }),
    ]);
    expect(filtered.totalSpendingCents).toBe(4000);
  });

  test("orders ties by category ID and derives the total from returned rows", async () => {
    const { householdId } = await insertHousehold(db, "Ordering");
    const { accountId } = await insertAccount(db, householdId);
    const { groupId } = await insertCategoryGroup(db, householdId);
    await insertCategory(db, householdId, groupId, { id: "category-z", name: "Zulu" });
    await insertCategory(db, householdId, groupId, { id: "category-a", name: "Alpha" });
    await insertTransaction(db, householdId, accountId, {
      date: "2026-09-10",
      normalizedAmount: -2500,
      amount: 2500,
      categoryId: "category-z",
    });
    await insertTransaction(db, householdId, accountId, {
      date: "2026-09-11",
      normalizedAmount: -2500,
      amount: 2500,
      categoryId: "category-a",
    });

    const result = await getToolSpendingSummary(householdId, RANGE, db);

    expect(result.categories.map((row) => row.categoryId)).toEqual([
      "category-a",
      "category-z",
    ]);
    expect(result.totalSpendingCents).toBe(
      result.categories.reduce((sum, row) => sum + row.amountCents, 0),
    );
    expect(result).not.toHaveProperty("credential");
    expect(result).not.toHaveProperty("plaidItemId");
  });

  test("does not write while producing the summary", async () => {
    const { householdId } = await insertHousehold(db, "Read only");
    const { accountId } = await insertAccount(db, householdId);
    const { groupId } = await insertCategoryGroup(db, householdId);
    const { categoryId } = await insertCategory(db, householdId, groupId);
    const { transactionId } = await insertTransaction(db, householdId, accountId, {
      date: "2026-09-12",
      normalizedAmount: -1000,
      amount: 1000,
      categoryId,
      updatedAt: new Date("2026-09-12T12:00:00Z"),
    });
    const before = await db.select().from(transactions);

    await getToolSpendingSummary(householdId, RANGE, db);

    const after = await db.select().from(transactions);
    expect(after).toEqual(before);
    expect(after.find((row) => row.id === transactionId)).toBeDefined();
  });
});
