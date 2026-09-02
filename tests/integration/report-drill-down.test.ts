import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertCategoryGroup,
  insertCategory,
  insertTransaction,
} from "./helpers";
import type { LedgrDb } from "../../src/db";

/**
 * Clicking a figure opens a sheet that must answer for that same figure. Two
 * things used to break that promise: the sheet summed only the page of rows it
 * had fetched (50 at most), and the query behind it filtered on category and
 * dates alone — so transfers, pending rows and credits joined a list that was
 * supposed to explain a spending number.
 *
 * These tests pin the drill-down against the tab figure that opened it, which
 * is the only invariant that matters here.
 */

let db: LedgrDb;
let close: () => Promise<void>;
let householdId: string;
let accountId: string;
let foodCatId: string;
let salaryCatId: string;

const RANGE = { dateFrom: "2026-03-01", dateTo: "2026-03-31" };

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  ({ householdId } = await insertHousehold(db));
  ({ accountId } = await insertAccount(db, householdId));

  const { groupId } = await insertCategoryGroup(db, householdId, { name: "Living" });
  ({ categoryId: foodCatId } = await insertCategory(db, householdId, groupId, { name: "Food" }));
  const incGroup = await insertCategoryGroup(db, householdId, { name: "Income" });
  ({ categoryId: salaryCatId } = await insertCategory(db, householdId, incGroup.groupId, {
    name: "Salary",
    isIncome: true,
  }));
});

afterEach(async () => {
  await close();
});

/** Every row shape the Spending figure excludes but a category+date query keeps. */
async function seedFoodWithNoise() {
  await insertTransaction(db, householdId, accountId, { date: "2026-03-05", normalizedAmount: -5000, amount: 5000, categoryId: foodCatId, name: "Grocery" });
  await insertTransaction(db, householdId, accountId, { date: "2026-03-15", normalizedAmount: -3000, amount: 3000, categoryId: foodCatId, name: "Restaurant" });
  // A refund: positive, so not spending.
  await insertTransaction(db, householdId, accountId, { date: "2026-03-20", normalizedAmount: 2000, amount: -2000, categoryId: foodCatId, name: "Grocery refund" });
  // Pending: not settled, so not spending.
  await insertTransaction(db, householdId, accountId, { date: "2026-03-21", normalizedAmount: -9900, amount: 9900, categoryId: foodCatId, name: "Pending charge", pending: true });
  // A transfer, and its paired leg.
  await insertTransaction(db, householdId, accountId, { date: "2026-03-22", normalizedAmount: -4400, amount: 4400, categoryId: foodCatId, name: "Transfer out", isTransfer: true });
  await insertTransaction(db, householdId, accountId, { date: "2026-03-23", normalizedAmount: -7700, amount: 7700, categoryId: foodCatId, name: "Paired leg", transferPairId: "pair-1" });
  // Outside the range.
  await insertTransaction(db, householdId, accountId, { date: "2026-02-25", normalizedAmount: -6600, amount: 6600, categoryId: foodCatId, name: "Last month" });
}

describe("a spending drill-down explains the figure that opened it", () => {
  test("its total equals the Spending tab row", async () => {
    await seedFoodWithNoise();
    const { getSpendingByCategory, getDrillDownTransactions } = await import("../../src/queries/reports");

    const row = (await getSpendingByCategory(householdId, RANGE, db)).find((r) => r.categoryName === "Food");
    const drill = await getDrillDownTransactions(
      householdId,
      { categoryId: foodCatId, ...RANGE, type: "expense" },
      50,
      db,
    );

    expect(row?.total).toBe(8000);
    expect(drill.total).toBe(row?.total);
  });

  test("it lists only the transactions the figure counted", async () => {
    await seedFoodWithNoise();
    const { getDrillDownTransactions } = await import("../../src/queries/reports");

    const drill = await getDrillDownTransactions(
      householdId,
      { categoryId: foodCatId, ...RANGE, type: "expense" },
      50,
      db,
    );

    expect(drill.rows.map((r) => r.name).sort()).toEqual(["Grocery", "Restaurant"]);
  });

  test("the total covers every match, not just the page that was fetched", async () => {
    // 120 charges of 100 each: two and a half pages at the sheet's limit.
    for (let i = 0; i < 120; i++) {
      await insertTransaction(db, householdId, accountId, {
        date: "2026-03-10",
        normalizedAmount: -100,
        amount: 100,
        categoryId: foodCatId,
        name: `Charge ${i}`,
      });
    }
    const { getSpendingByCategory, getDrillDownTransactions } = await import("../../src/queries/reports");

    const row = (await getSpendingByCategory(householdId, RANGE, db)).find((r) => r.categoryName === "Food");
    const drill = await getDrillDownTransactions(
      householdId,
      { categoryId: foodCatId, ...RANGE, type: "expense" },
      50,
      db,
    );

    expect(drill.rows).toHaveLength(50);
    expect(drill.hasMore).toBe(true);
    expect(drill.matchCount).toBe(120);
    expect(drill.total).toBe(12000);
    expect(drill.total).toBe(row?.total);
  });

  test("an uncategorized drill-down matches its Spending row", async () => {
    await insertTransaction(db, householdId, accountId, { date: "2026-03-08", normalizedAmount: -7000, amount: 7000, categoryId: null, name: "Unknown merchant" });
    await insertTransaction(db, householdId, accountId, { date: "2026-03-09", normalizedAmount: 1500, amount: -1500, categoryId: null, name: "Unknown credit" });
    const { getSpendingByCategory, getDrillDownTransactions } = await import("../../src/queries/reports");

    const row = (await getSpendingByCategory(householdId, RANGE, db)).find((r) => r.categoryId === null);
    const drill = await getDrillDownTransactions(
      householdId,
      { categoryId: null, ...RANGE, type: "expense" },
      50,
      db,
    );

    expect(drill.total).toBe(7000);
    expect(drill.total).toBe(row?.total);
    expect(drill.rows.map((r) => r.name)).toEqual(["Unknown merchant"]);
  });

  test("it honours the account filter the report was run with", async () => {
    const other = await insertAccount(db, householdId, { name: "Other" });
    await insertTransaction(db, householdId, accountId, { date: "2026-03-05", normalizedAmount: -5000, amount: 5000, categoryId: foodCatId, name: "On account" });
    await insertTransaction(db, householdId, other.accountId, { date: "2026-03-06", normalizedAmount: -2500, amount: 2500, categoryId: foodCatId, name: "Off account" });
    const { getDrillDownTransactions } = await import("../../src/queries/reports");

    const drill = await getDrillDownTransactions(
      householdId,
      { categoryId: foodCatId, ...RANGE, type: "expense", accountIds: [accountId] },
      50,
      db,
    );

    expect(drill.total).toBe(5000);
    expect(drill.rows.map((r) => r.name)).toEqual(["On account"]);
  });
});

describe("an income drill-down explains its own figure", () => {
  test("its total equals the Cash Flow income node", async () => {
    await insertTransaction(db, householdId, accountId, { date: "2026-03-01", normalizedAmount: 500000, amount: -500000, categoryId: salaryCatId, name: "Salary" });
    await insertTransaction(db, householdId, accountId, { date: "2026-03-15", normalizedAmount: 250000, amount: -250000, categoryId: salaryCatId, name: "Bonus" });
    await insertTransaction(db, householdId, accountId, { date: "2026-03-16", normalizedAmount: 90000, amount: -90000, categoryId: salaryCatId, name: "Pending pay", pending: true });
    const { getCashFlowSankey, getDrillDownTransactions } = await import("../../src/queries/reports");

    const { links } = await getCashFlowSankey(householdId, RANGE, db);
    const nodeTotal = links
      .filter((l) => l.source === `income-${salaryCatId}`)
      .reduce((s, l) => s + l.value, 0);

    const drill = await getDrillDownTransactions(
      householdId,
      { categoryId: salaryCatId, ...RANGE, type: "income" },
      50,
      db,
    );

    expect(drill.total).toBe(750000);
    expect(drill.total).toBe(nodeTotal);
    expect(drill.rows.map((r) => r.name).sort()).toEqual(["Bonus", "Salary"]);
  });
});

describe("a category's comparison against the baseline", () => {
  test("a category absent from the baseline reports no previous figure, not zero", async () => {
    // Food spends in both periods; Salary's category is irrelevant here — what
    // matters is that a category with no baseline row is distinguishable from
    // one that spent nothing, which `?? 0` made impossible.
    await insertTransaction(db, householdId, accountId, { date: "2026-03-05", normalizedAmount: -5000, amount: 5000, categoryId: foodCatId, name: "Grocery" });
    await insertTransaction(db, householdId, accountId, { date: "2026-02-10", normalizedAmount: -2000, amount: 2000, categoryId: foodCatId, name: "Grocery last period" });
    await insertTransaction(db, householdId, accountId, { date: "2026-03-06", normalizedAmount: -3000, amount: 3000, categoryId: null, name: "First ever uncategorized" });
    const { getSpendingByCategory } = await import("../../src/queries/reports");

    const rows = await getSpendingByCategory(householdId, RANGE, db, {
      dateFrom: "2026-02-01",
      dateTo: "2026-02-28",
    });

    expect(rows.find((r) => r.categoryName === "Food")?.prevTotal).toBe(2000);
    expect(rows.find((r) => r.categoryId === null)?.prevTotal).toBeNull();
  });

  test("without a comparison period nothing claims a previous figure", async () => {
    await insertTransaction(db, householdId, accountId, { date: "2026-03-05", normalizedAmount: -5000, amount: 5000, categoryId: foodCatId, name: "Grocery" });
    const { getSpendingByCategory } = await import("../../src/queries/reports");

    const rows = await getSpendingByCategory(householdId, RANGE, db);

    expect(rows.every((r) => r.prevTotal === null)).toBe(true);
  });
});
