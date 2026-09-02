import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertCategoryGroup,
  insertCategory,
  insertTransaction,
  insertRecurringTransaction,
} from "./helpers";
import { getCurrentMonth, monthBounds, shiftMonth } from "../../src/lib/date-utils";
import type { LedgrDb } from "../../src/db";

/**
 * Safe to Spend answers "how much of this month is still mine to spend?" — so
 * every part of it is scoped to the current calendar month, deliberately and
 * independently of the report's date filter.
 *
 * Dates here are derived from `new Date()`: the query resolves its own window
 * from the calendar, so fixtures pinned to literal dates would rot.
 */

let db: LedgrDb;
let close: () => Promise<void>;
let householdId: string;
let accountId: string;
let foodCatId: string;
let salaryCatId: string;

const THIS_MONTH = getCurrentMonth();
const LAST_MONTH = shiftMonth(THIS_MONTH, -1);
/** The 10th: safely inside every month, whatever today happens to be. */
const IN_MONTH = `${THIS_MONTH}-10`;
const IN_LAST_MONTH = `${LAST_MONTH}-10`;

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

describe("Spent So Far counts spending", () => {
  test("a charge this month is spending", async () => {
    // Negative normalizedAmount is a charge — the same sign convention the
    // Spending tab uses. Summing positives instead made this tile read $0.00
    // in every month, whatever the household had spent.
    await insertTransaction(db, householdId, accountId, { date: IN_MONTH, normalizedAmount: -5000, amount: 5000, categoryId: foodCatId, name: "Grocery" });
    await insertTransaction(db, householdId, accountId, { date: IN_MONTH, normalizedAmount: -3000, amount: 3000, categoryId: foodCatId, name: "Restaurant" });
    const { getSafeToSpend } = await import("../../src/queries/reports");

    const result = await getSafeToSpend(householdId, db);

    expect(result.discretionarySpent).toBe(8000);
  });

  test("a refund is not spending", async () => {
    await insertTransaction(db, householdId, accountId, { date: IN_MONTH, normalizedAmount: -5000, amount: 5000, categoryId: foodCatId, name: "Grocery" });
    await insertTransaction(db, householdId, accountId, { date: IN_MONTH, normalizedAmount: 2000, amount: -2000, categoryId: foodCatId, name: "Refund" });
    const { getSafeToSpend } = await import("../../src/queries/reports");

    expect((await getSafeToSpend(householdId, db)).discretionarySpent).toBe(5000);
  });

  test("a recurring charge belongs to Recurring Bills, not Spent So Far", async () => {
    const { recurringId } = await insertRecurringTransaction(db, householdId, { averageAmount: 4000 });
    await insertTransaction(db, householdId, accountId, { date: IN_MONTH, normalizedAmount: -4000, amount: 4000, categoryId: foodCatId, name: "Netflix", recurringTransactionId: recurringId });
    await insertTransaction(db, householdId, accountId, { date: IN_MONTH, normalizedAmount: -1500, amount: 1500, categoryId: foodCatId, name: "Coffee" });
    const { getSafeToSpend } = await import("../../src/queries/reports");

    const result = await getSafeToSpend(householdId, db);

    expect(result.discretionarySpent).toBe(1500);
    expect(result.recurringExpenses).toBe(4000);
  });

  test("last month's charges are not this month's spending", async () => {
    await insertTransaction(db, householdId, accountId, { date: IN_LAST_MONTH, normalizedAmount: -9900, amount: 9900, categoryId: foodCatId, name: "Old charge" });
    await insertTransaction(db, householdId, accountId, { date: IN_MONTH, normalizedAmount: -1000, amount: 1000, categoryId: foodCatId, name: "New charge" });
    const { getSafeToSpend } = await import("../../src/queries/reports");

    expect((await getSafeToSpend(householdId, db)).discretionarySpent).toBe(1000);
  });
});

describe("the window is the current calendar month, whatever the report filter says", () => {
  test("it reads the current month by default", async () => {
    await insertTransaction(db, householdId, accountId, { date: IN_MONTH, normalizedAmount: 500000, amount: -500000, categoryId: salaryCatId, name: "Salary" });
    await insertTransaction(db, householdId, accountId, { date: IN_LAST_MONTH, normalizedAmount: 500000, amount: -500000, categoryId: salaryCatId, name: "Last salary" });
    const { getSafeToSpend } = await import("../../src/queries/reports");

    expect((await getSafeToSpend(householdId, db)).monthlyIncome).toBe(500000);
  });

  test("an explicit month overrides the default", async () => {
    await insertTransaction(db, householdId, accountId, { date: IN_LAST_MONTH, normalizedAmount: 500000, amount: -500000, categoryId: salaryCatId, name: "Last salary" });
    const { getSafeToSpend } = await import("../../src/queries/reports");

    expect((await getSafeToSpend(householdId, db, LAST_MONTH)).monthlyIncome).toBe(500000);
    expect((await getSafeToSpend(householdId, db, THIS_MONTH)).monthlyIncome).toBe(0);
  });

  test("the month it reports is the month it measured", async () => {
    const { getSafeToSpend } = await import("../../src/queries/reports");

    const result = await getSafeToSpend(householdId, db);

    expect(result.month).toBe(THIS_MONTH);
    expect(monthBounds(result.month).from).toBe(`${THIS_MONTH}-01`);
  });
});

describe("a household with no income categories", () => {
  test("reports zero income rather than failing", async () => {
    const { db: db2, close: close2 } = await createTestDb();
    const { householdId: h2 } = await insertHousehold(db2);
    const { accountId: a2 } = await insertAccount(db2, h2);
    await insertTransaction(db2, h2, a2, { date: IN_MONTH, normalizedAmount: -2500, amount: 2500, name: "Charge" });
    const { getSafeToSpend } = await import("../../src/queries/reports");

    try {
      const result = await getSafeToSpend(h2, db2);
      expect(result.monthlyIncome).toBe(0);
      expect(result.discretionarySpent).toBe(2500);
    } finally {
      await close2();
    }
  });
});
