import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { v4 as uuid } from "uuid";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertTransaction,
  insertCategoryGroup,
  insertCategory,
  insertTransactionSplit,
} from "./helpers";
import { balanceHistory } from "../../src/db/schema";
import type { LedgrDb } from "../../src/db";

let db: LedgrDb;
let close: () => Promise<void>;
let householdId: string;
let accountId: string;
let foodCatId: string;
let rentCatId: string;
let incomeCatId: string;
let groupId: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());

  ({ householdId } = await insertHousehold(db));
  ({ accountId } = await insertAccount(db, householdId));
  ({ groupId } = await insertCategoryGroup(db, householdId, { name: "Living" }));
  ({ categoryId: foodCatId } = await insertCategory(db, householdId, groupId, { name: "Food" }));
  ({ categoryId: rentCatId } = await insertCategory(db, householdId, groupId, { name: "Rent" }));
  const incGroup = await insertCategoryGroup(db, householdId, { name: "Income" });
  ({ categoryId: incomeCatId } = await insertCategory(db, householdId, incGroup.groupId, { name: "Salary", isIncome: true }));

  await insertTransaction(db, householdId, accountId, { date: "2026-03-05", normalizedAmount: -5000, amount: 5000, categoryId: foodCatId, name: "Grocery" });
  await insertTransaction(db, householdId, accountId, { date: "2026-03-15", normalizedAmount: -3000, amount: 3000, categoryId: foodCatId, name: "Restaurant" });
  await insertTransaction(db, householdId, accountId, { date: "2026-03-01", normalizedAmount: -100000, amount: 100000, categoryId: rentCatId, name: "Rent" });
  await insertTransaction(db, householdId, accountId, { date: "2026-03-01", normalizedAmount: 500000, amount: -500000, categoryId: incomeCatId, name: "Salary" });
  await insertTransaction(db, householdId, accountId, { date: "2026-02-10", normalizedAmount: -4000, amount: 4000, categoryId: foodCatId, name: "Grocery Feb" });
});

afterEach(async () => {
  await close();
});

describe("getSpendingByCategory", () => {
  test("returns correct totals grouped by category", async () => {
    const { getSpendingByCategory } = await import("../../src/queries/reports");
    const result = await getSpendingByCategory(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    const food = result.find((r) => r.categoryName === "Food");
    const rent = result.find((r) => r.categoryName === "Rent");
    expect(food?.total).toBe(8000);
    expect(rent?.total).toBe(100000);
    const salary = result.find((r) => r.categoryName === "Salary");
    expect(salary).toBeUndefined();
  });

  test("comparison period calculates deltas", async () => {
    const { getSpendingByCategory } = await import("../../src/queries/reports");
    const result = await getSpendingByCategory(
      householdId,
      { dateFrom: "2026-03-01", dateTo: "2026-03-31" },
      db,
      { dateFrom: "2026-02-01", dateTo: "2026-02-28" },
    );

    const food = result.find((r) => r.categoryName === "Food");
    expect(food?.total).toBe(8000);
    expect(food?.prevTotal).toBe(4000);
  });
});

describe("getIncomeVsExpense", () => {
  test("classifies by category isIncome flag, not by sign", async () => {
    await insertTransaction(db, householdId, accountId, { date: "2026-03-20", normalizedAmount: -2000, amount: 2000, categoryId: null, name: "Unknown" });

    const { getIncomeVsExpense } = await import("../../src/queries/reports");
    const result = await getIncomeVsExpense(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    const march = result.find((r) => r.period === "2026-03");
    expect(march).toBeDefined();
    expect(march!.income).toBe(500000);
    expect(march!.expenses).toBe(110000);
    expect(march!.net).toBe(500000 - 110000);
  });

  test("counts an uncategorized positive amount as income, not expense", async () => {
    // An uncategorized paycheck (positive normalizedAmount) must not be
    // bucketed into expenses via ABS() just because categoryId is null.
    await insertTransaction(db, householdId, accountId, { date: "2026-03-20", normalizedAmount: 300000, amount: -300000, categoryId: null, name: "Mystery Deposit" });

    const { getIncomeVsExpense } = await import("../../src/queries/reports");
    const result = await getIncomeVsExpense(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    const march = result.find((r) => r.period === "2026-03");
    expect(march).toBeDefined();
    // Categorized salary (500000) + uncategorized positive deposit (300000).
    expect(march!.income).toBe(800000);
    // Only the categorized non-income transactions (food + rent).
    expect(march!.expenses).toBe(108000);
    expect(march!.net).toBe(800000 - 108000);
  });
});

describe("getIncomeExpenseByCategory", () => {
  test("both pools sum as positive magnitudes", async () => {
    const { getIncomeExpenseByCategory } = await import("../../src/queries/reports");
    const result = await getIncomeExpenseByCategory(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    const salary = result.find((r) => r.categoryName === "Salary");
    const food = result.find((r) => r.categoryName === "Food");
    const rent = result.find((r) => r.categoryName === "Rent");

    expect(salary?.isIncome).toBe(true);
    expect(salary?.total).toBe(500000); // signed sum of +500000
    expect(food?.isIncome).toBe(false);
    // Magnitudes, not signed sums: the table renders these directly and the
    // pool percentages divide by them. See report-consistency.test.ts.
    expect(food?.total).toBe(8000); // |-5000| + |-3000|
    expect(rent?.total).toBe(100000);
  });

  test("sorts rows by total descending", async () => {
    const { getIncomeExpenseByCategory } = await import("../../src/queries/reports");
    const result = await getIncomeExpenseByCategory(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    // Largest first within the combined list. Sorting signed totals used to
    // rank expenses backwards, putting the smallest expense at the top.
    expect(result.map((r) => r.categoryName)).toEqual(["Salary", "Rent", "Food"]);
  });

  test("monthlyAverage divides by the span actually covered, and uncategorized gets its own row", async () => {
    // A lone null-category txn in January is the earliest matching
    // transaction, so it anchors the divisor's start; it's also itself
    // reported as uncategorized spending.
    await insertTransaction(db, householdId, accountId, { date: "2026-01-20", normalizedAmount: -9999, amount: 9999, categoryId: null, name: "Uncat Jan" });

    const { getIncomeExpenseByCategory } = await import("../../src/queries/reports");
    const { monthsSpanned } = await import("../../src/lib/date-utils");
    const result = await getIncomeExpenseByCategory(householdId, { dateFrom: "2026-01-01", dateTo: "2026-03-31" }, db);

    // The null-category transaction is spending and is reported as such.
    const uncategorized = result.find((r) => r.categoryId === null);
    expect(uncategorized?.total).toBe(9999);
    expect(uncategorized?.isIncome).toBe(false);

    // Food = Feb (4000) + Mar (8000) = 12000, averaged over Jan 20 (the
    // earliest matching transaction) through Mar 31 — not the three calendar
    // months the range merely touches.
    const food = result.find((r) => r.categoryName === "Food");
    const expectedMonths = monthsSpanned("2026-01-20", "2026-03-31");
    expect(food?.total).toBe(12000);
    expect(food?.monthlyAverage).toBe(Math.round(12000 / expectedMonths));
  });

  test("an all-time dateFrom divides by the real activity span, not decades", async () => {
    // The "all time" preset passes dateFrom "2000-01-01". Dividing by the
    // calendar span since then turned a couple months of spending into a
    // rounding error; the divisor must anchor on real activity instead.
    const { getIncomeExpenseByCategory } = await import("../../src/queries/reports");
    const { monthsSpanned } = await import("../../src/lib/date-utils");
    const result = await getIncomeExpenseByCategory(householdId, { dateFrom: "2000-01-01", dateTo: "2026-03-31" }, db);

    // Earliest real transaction (from the top-level beforeEach) is 2026-02-10.
    const food = result.find((r) => r.categoryName === "Food");
    const expectedMonths = monthsSpanned("2026-02-10", "2026-03-31");
    expect(food?.total).toBe(12000); // Feb (4000) + Mar (8000)
    expect(food?.monthlyAverage).toBe(Math.round(12000 / expectedMonths));
  });

  test("percentOfTotal is relative to the income vs expense pool", async () => {
    const { getIncomeExpenseByCategory } = await import("../../src/queries/reports");
    const result = await getIncomeExpenseByCategory(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    const salary = result.find((r) => r.categoryName === "Salary");
    const food = result.find((r) => r.categoryName === "Food");
    const rent = result.find((r) => r.categoryName === "Rent");

    // Only income category -> 100% of income pool.
    expect(salary?.percentOfTotal).toBeCloseTo(100, 5);
    // Expense categories sum raw signed amounts, so both a category total and
    // the expense pool total are negative; their ratio is the correct positive
    // share of the expense pool (pool total -108000).
    expect(food?.percentOfTotal).toBeCloseTo((-8000 / -108000) * 100, 5);
    expect(rent?.percentOfTotal).toBeCloseTo((-100000 / -108000) * 100, 5);
  });

  test("table income rows sum to the Total Income tile, including a debit mis-filed under an income category", async () => {
    // Real-data shape: a card charge AI-categorized as "Salary", alongside
    // enough real salary that the category still nets positive overall.
    // Summing the income side as ABS() added the debit's magnitude as income
    // instead of subtracting it, so this table's income overstated the tile.
    await insertTransaction(db, householdId, accountId, {
      date: "2026-03-10",
      normalizedAmount: 700000,
      amount: -700000,
      categoryId: incomeCatId,
      name: "Salary (second check)",
    });
    await insertTransaction(db, householdId, accountId, {
      date: "2026-03-11",
      normalizedAmount: -583565,
      amount: 583565,
      categoryId: incomeCatId,
      name: "Tcp*csusac",
    });
    // An uncategorized paycheck: the tile counts a positive uncategorized
    // credit as income, so the table must surface it as its own row too, or
    // the two figures can never agree.
    await insertTransaction(db, householdId, accountId, {
      date: "2026-03-12",
      normalizedAmount: 200000,
      amount: -200000,
      categoryId: null,
      name: "Mystery deposit",
    });

    const { getIncomeVsExpense, getIncomeExpenseByCategory } = await import("../../src/queries/reports");
    const range = { dateFrom: "2026-03-01", dateTo: "2026-03-31" };

    const tileIncome = (await getIncomeVsExpense(householdId, range, db))
      .reduce((s, r) => s + r.income, 0);
    const rows = await getIncomeExpenseByCategory(householdId, range, db);
    const tableIncome = rows.filter((r) => r.isIncome).reduce((s, r) => s + r.total, 0);

    expect(tableIncome).toBe(tileIncome);

    // Salary nets 500000 (beforeEach) + 700000 - 583565 = 616435, corrected
    // down from what ABS() used to report (500000 + 700000 + 583565).
    const salary = rows.find((r) => r.categoryName === "Salary");
    expect(salary?.total).toBe(616435);
  });

  test("an income category whose net comes out negative is dropped, not shown as negative income", async () => {
    // The debit outweighs the category's only credit, so Salary's net for the
    // period is negative — it must disappear from the income list rather than
    // render as "-$835.65 of income".
    await insertTransaction(db, householdId, accountId, {
      date: "2026-03-11",
      normalizedAmount: -583565,
      amount: 583565,
      categoryId: incomeCatId,
      name: "Big mis-filed debit",
    });

    const { getIncomeExpenseByCategory } = await import("../../src/queries/reports");
    const result = await getIncomeExpenseByCategory(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    expect(result.find((r) => r.categoryName === "Salary")).toBeUndefined();
  });

  test("a positive uncategorized credit is its own Uncategorized income row", async () => {
    await insertTransaction(db, householdId, accountId, {
      date: "2026-03-12",
      normalizedAmount: 200000,
      amount: -200000,
      categoryId: null,
      name: "Mystery deposit",
    });

    const { getIncomeExpenseByCategory } = await import("../../src/queries/reports");
    const result = await getIncomeExpenseByCategory(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    const uncategorizedIncome = result.find((r) => r.categoryId === null && r.isIncome);
    const uncategorizedExpense = result.find((r) => r.categoryId === null && !r.isIncome);
    expect(uncategorizedIncome?.total).toBe(200000);
    expect(uncategorizedExpense).toBeUndefined(); // no uncategorized debits in this range
  });
});

describe("getCategoryTrends", () => {
  test("groups by month and category", async () => {
    const { getCategoryTrends } = await import("../../src/queries/reports");
    const result = await getCategoryTrends(householdId, { dateFrom: "2026-02-01", dateTo: "2026-03-31" }, db);

    const foodMarch = result.find((r) => r.period === "2026-03" && r.categoryName === "Food");
    const foodFeb = result.find((r) => r.period === "2026-02" && r.categoryName === "Food");
    expect(foodMarch?.total).toBe(8000);
    expect(foodFeb?.total).toBe(4000);
  });

  test("income categories excluded from trends", async () => {
    const { getCategoryTrends } = await import("../../src/queries/reports");
    const result = await getCategoryTrends(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    const salaryTrend = result.find((r) => r.categoryName === "Salary");
    expect(salaryTrend).toBeUndefined();
  });
});

describe("getCashFlowSankey", () => {
  test("expenses are negative non-income txns summed as ABS, grouped per category", async () => {
    // beforeEach data: Salary +500000 (income), Food -5000/-3000 and Rent
    // -100000 (negative normalizedAmount = expenses, matching the codebase's
    // convention). Food = 8000, Rent = 100000, income = 500000.
    const { getCashFlowSankey } = await import("../../src/queries/reports");
    const { nodes, links } = await getCashFlowSankey(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    expect(nodes.some((n) => n.id === `income-${incomeCatId}` && n.type === "income" && n.name === "Salary")).toBe(true);
    expect(nodes.some((n) => n.id === `expense-${foodCatId}` && n.type === "expense")).toBe(true);
    expect(nodes.some((n) => n.id === `expense-${rentCatId}` && n.type === "expense")).toBe(true);
    expect(nodes.some((n) => n.id === "savings" && n.type === "savings")).toBe(true);

    const share = 1; // single income category -> 100% share
    const foodLink = links.find((l) => l.target === `expense-${foodCatId}`);
    const rentLink = links.find((l) => l.target === `expense-${rentCatId}`);
    const savingsLink = links.find((l) => l.target === "savings");
    expect(foodLink?.value).toBe(Math.round(8000 * share));
    expect(rentLink?.value).toBe(Math.round(100000 * share));
    // surplus = 500000 - (8000 + 100000) = 392000
    expect(savingsLink?.value).toBe(Math.round(392000 * share));
  });

  test("positive-amount non-income txns (refunds) are not counted as expenses", async () => {
    // A positive normalizedAmount on an expense category is a refund/credit and
    // must not inflate (or create) an expense node.
    await insertTransaction(db, householdId, accountId, { date: "2026-03-06", normalizedAmount: 2000, amount: -2000, categoryId: foodCatId, name: "Food refund" });

    const { getCashFlowSankey } = await import("../../src/queries/reports");
    const { links } = await getCashFlowSankey(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    // Food expense stays 8000 (the +2000 refund is ignored).
    const foodLink = links.find((l) => l.target === `expense-${foodCatId}`);
    expect(foodLink?.value).toBe(8000);
  });

  test("income category sums by signed amount, matching the Total Income tile", async () => {
    // A negative-signed income txn (e.g. a reversal, or a debit mis-filed
    // under an income category) subtracts, matching getIncomeVsExpense's
    // rule — ABS() previously added its magnitude, inflating the node it
    // should have shrunk.
    await insertTransaction(db, householdId, accountId, { date: "2026-03-09", normalizedAmount: -100000, amount: 100000, categoryId: incomeCatId, name: "Income reversal" });

    const { getCashFlowSankey } = await import("../../src/queries/reports");
    const { links } = await getCashFlowSankey(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    // Income pool = 500000 + (-100000) = 400000; expenses 108000; surplus 292000.
    const savingsLink = links.find((l) => l.target === "savings");
    expect(savingsLink?.value).toBe(292000);
  });

  test("an income category whose signed net is <= 0 is dropped as a source", async () => {
    await insertTransaction(db, householdId, accountId, { date: "2026-03-09", normalizedAmount: -600000, amount: 600000, categoryId: incomeCatId, name: "Big reversal" });

    const { getCashFlowSankey } = await import("../../src/queries/reports");
    const { nodes } = await getCashFlowSankey(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    expect(nodes.find((n) => n.id === `income-${incomeCatId}`)).toBeUndefined();
  });

  test("adds a Shortfall source when expenses exceed income, so each income node keeps its own real total", async () => {
    // Income (100000) is smaller than expenses (150000 across two
    // categories). Splitting every expense in proportion to income used to
    // inflate the lone income node's outflow to 150000 — more than the
    // household actually earned.
    const range = { dateFrom: "2026-04-01", dateTo: "2026-04-30" };
    await insertTransaction(db, householdId, accountId, { date: "2026-04-01", normalizedAmount: 100000, amount: -100000, categoryId: incomeCatId, name: "Salary" });
    await insertTransaction(db, householdId, accountId, { date: "2026-04-02", normalizedAmount: -100000, amount: 100000, categoryId: foodCatId, name: "Food" });
    await insertTransaction(db, householdId, accountId, { date: "2026-04-03", normalizedAmount: -50000, amount: 50000, categoryId: rentCatId, name: "Rent" });

    const { getCashFlowSankey } = await import("../../src/queries/reports");
    const { nodes, links } = await getCashFlowSankey(householdId, range, db);

    expect(nodes.find((n) => n.id === "shortfall")).toEqual({ id: "shortfall", name: "Shortfall", type: "shortfall" });
    expect(nodes.find((n) => n.id === "savings")).toBeUndefined();

    const totalFrom = (sourceId: string) =>
      links.filter((l) => l.source === sourceId).reduce((s, l) => s + l.value, 0);
    const totalTo = (targetId: string) =>
      links.filter((l) => l.target === targetId).reduce((s, l) => s + l.value, 0);

    // The income node's own outflow equals its real income, not more.
    expect(totalFrom(`income-${incomeCatId}`)).toBe(100000);
    expect(totalFrom("shortfall")).toBe(50000);
    expect(totalTo(`expense-${foodCatId}`)).toBe(100000);
    expect(totalTo(`expense-${rentCatId}`)).toBe(50000);
  });

  test("gives uncategorized credits an income source, so the income side matches the Total Income tile", async () => {
    const range = { dateFrom: "2026-03-01", dateTo: "2026-03-31" };
    await insertTransaction(db, householdId, accountId, { date: "2026-03-10", normalizedAmount: 20000, amount: -20000, categoryId: null, name: "Venmo" });

    const { getCashFlowSankey, getIncomeVsExpense } = await import("../../src/queries/reports");
    const { nodes, links } = await getCashFlowSankey(householdId, range, db);
    const tileIncome = (await getIncomeVsExpense(householdId, range, db)).reduce((s, r) => s + r.income, 0);

    expect(nodes.find((n) => n.id === "income-uncategorized")?.type).toBe("income");
    const incomeOut = links
      .filter((l) => l.source.startsWith("income-"))
      .reduce((s, l) => s + l.value, 0);
    expect(incomeOut).toBe(tileIncome);
  });

  test("applies the categoryIds filter like other report queries", async () => {
    const { getCashFlowSankey } = await import("../../src/queries/reports");
    const { nodes } = await getCashFlowSankey(
      householdId,
      { dateFrom: "2026-03-01", dateTo: "2026-03-31", categoryIds: [foodCatId] },
      db,
    );

    expect(nodes.some((n) => n.id === `expense-${foodCatId}`)).toBe(true);
    expect(nodes.some((n) => n.id === `expense-${rentCatId}`)).toBe(false);
    expect(nodes.some((n) => n.id === `income-${incomeCatId}`)).toBe(false);
  });

  test("allocates with largest-remainder so no source or target total drifts by a cent", async () => {
    // Three equal income sources splitting two expense categories that don't
    // divide evenly by three. Plain per-link Math.round gave every source the
    // same rounded pair (67/33), drifting Food to $2.01 against its real
    // $2.00 and Rent to $0.99 against its real $1.00 — the same shape as the
    // real "$3,299.99 vs $3,300.00" Rent drift.
    const range = { dateFrom: "2026-05-01", dateTo: "2026-05-31" };
    const incGroup = await insertCategoryGroup(db, householdId, { name: "Income 2" });
    const { categoryId: freelanceCatId } = await insertCategory(db, householdId, incGroup.groupId, { name: "Freelance", isIncome: true });
    const { categoryId: interestCatId } = await insertCategory(db, householdId, incGroup.groupId, { name: "Interest", isIncome: true });

    for (const catId of [incomeCatId, freelanceCatId, interestCatId]) {
      await insertTransaction(db, householdId, accountId, { date: "2026-05-01", normalizedAmount: 100, amount: -100, categoryId: catId, name: "Income" });
    }
    await insertTransaction(db, householdId, accountId, { date: "2026-05-02", normalizedAmount: -200, amount: 200, categoryId: foodCatId, name: "Food" });
    await insertTransaction(db, householdId, accountId, { date: "2026-05-03", normalizedAmount: -100, amount: 100, categoryId: rentCatId, name: "Rent" });

    const { getCashFlowSankey } = await import("../../src/queries/reports");
    const { links } = await getCashFlowSankey(householdId, range, db);

    const totalTo = (targetId: string) => links.filter((l) => l.target === targetId).reduce((s, l) => s + l.value, 0);
    const totalFrom = (sourceId: string) => links.filter((l) => l.source === sourceId).reduce((s, l) => s + l.value, 0);

    expect(totalTo(`expense-${foodCatId}`)).toBe(200);
    expect(totalTo(`expense-${rentCatId}`)).toBe(100);
    for (const catId of [incomeCatId, freelanceCatId, interestCatId]) {
      expect(totalFrom(`income-${catId}`)).toBe(100);
    }
  });
});

describe("getReportNetWorthHistory", () => {
  async function insertBalance(accountId: string, date: string, balance: number) {
    await db.insert(balanceHistory).values({ id: uuid(), accountId, date, balance });
  }

  test("sums assets and liabilities per date by account type", async () => {
    // accountId (from beforeEach) is a checking account -> asset.
    const { accountId: savingsId } = await insertAccount(db, householdId, { name: "Savings", type: "savings" });
    const { accountId: creditId } = await insertAccount(db, householdId, { name: "Card", type: "credit" });

    await insertBalance(accountId, "2026-04-01", 70000);
    await insertBalance(savingsId, "2026-04-01", 30000);
    await insertBalance(creditId, "2026-04-01", -15000);
    await insertBalance(accountId, "2026-04-15", 80000);

    const { getReportNetWorthHistory } = await import("../../src/queries/reports");
    const result = await getReportNetWorthHistory(householdId, { dateFrom: "2026-04-01", dateTo: "2026-04-30" }, db);

    expect(result.map((r) => r.date)).toEqual(["2026-04-01", "2026-04-15"]);

    const d1 = result.find((r) => r.date === "2026-04-01")!;
    expect(d1.assets).toBe(100000); // checking 70000 + savings 30000
    expect(d1.liabilities).toBe(-15000); // credit, stored negative
    expect(d1.netWorth).toBe(85000);

    // 2026-04-15 only has a new row for checking. Savings and the credit card
    // carry forward their last known balance rather than dropping out — the
    // bug this test used to encode zeroed both of them out on any day they
    // didn't happen to report, swinging the series wildly.
    const d2 = result.find((r) => r.date === "2026-04-15")!;
    expect(d2.assets).toBe(110000); // checking 80000 + savings carried forward 30000
    expect(d2.liabilities).toBe(-15000); // credit carried forward
    expect(d2.netWorth).toBe(95000);
  });

  test("carries each account's last known balance forward across dates without a snapshot", async () => {
    // Sparse snapshots: checking reports on the 1st and 3rd, savings only on
    // the 2nd. Summing only same-day rows swings the series $70k -> $30k ->
    // $75k; carry-forward keeps every in-scope account counted every date.
    const { accountId: savingsId } = await insertAccount(db, householdId, { name: "Savings", type: "savings" });
    await insertBalance(accountId, "2026-04-01", 70000);
    await insertBalance(savingsId, "2026-04-02", 30000);
    await insertBalance(accountId, "2026-04-03", 75000);

    const { getReportNetWorthHistory } = await import("../../src/queries/reports");
    const result = await getReportNetWorthHistory(householdId, { dateFrom: "2026-04-01", dateTo: "2026-04-30" }, db);

    expect(result.map((r) => r.date)).toEqual(["2026-04-01", "2026-04-02", "2026-04-03"]);
    expect(result.find((r) => r.date === "2026-04-01")!.assets).toBe(70000); // savings not seen yet
    expect(result.find((r) => r.date === "2026-04-02")!.assets).toBe(100000); // checking carried + new savings
    expect(result.find((r) => r.date === "2026-04-03")!.assets).toBe(105000); // checking updated, savings carried
  });

  test("seeds an account's starting value from its most recent balance before the window", async () => {
    // Checking's only snapshot predates the report window; without seeding it
    // would contribute nothing to a date it should still count toward.
    const { accountId: savingsId } = await insertAccount(db, householdId, { name: "Savings", type: "savings" });
    await insertBalance(accountId, "2026-03-25", 60000);
    await insertBalance(savingsId, "2026-04-10", 20000);

    const { getReportNetWorthHistory } = await import("../../src/queries/reports");
    const result = await getReportNetWorthHistory(householdId, { dateFrom: "2026-04-01", dateTo: "2026-04-30" }, db);

    expect(result.map((r) => r.date)).toEqual(["2026-04-10"]);
    expect(result[0].assets).toBe(80000); // checking seeded at 60000 + savings 20000
  });

  test("hidden accounts are excluded", async () => {
    const { accountId: hiddenId } = await insertAccount(db, householdId, { name: "Hidden", type: "savings", isHidden: true });
    await insertBalance(accountId, "2026-04-01", 50000);
    await insertBalance(hiddenId, "2026-04-01", 999999);

    const { getReportNetWorthHistory } = await import("../../src/queries/reports");
    const result = await getReportNetWorthHistory(householdId, { dateFrom: "2026-04-01", dateTo: "2026-04-30" }, db);

    const d1 = result.find((r) => r.date === "2026-04-01")!;
    expect(d1.assets).toBe(50000);
  });

  test("account filter narrows to the given accounts", async () => {
    const { accountId: savingsId } = await insertAccount(db, householdId, { name: "Savings", type: "savings" });
    await insertBalance(accountId, "2026-04-01", 70000);
    await insertBalance(savingsId, "2026-04-01", 30000);

    const { getReportNetWorthHistory } = await import("../../src/queries/reports");
    const result = await getReportNetWorthHistory(
      householdId,
      { dateFrom: "2026-04-01", dateTo: "2026-04-30", accountIds: [accountId] },
      db,
    );

    const d1 = result.find((r) => r.date === "2026-04-01")!;
    expect(d1.assets).toBe(70000);
  });

  test("returns empty when the account filter matches nothing", async () => {
    await insertBalance(accountId, "2026-04-01", 70000);

    const { getReportNetWorthHistory } = await import("../../src/queries/reports");
    const result = await getReportNetWorthHistory(
      householdId,
      { dateFrom: "2026-04-01", dateTo: "2026-04-30", accountIds: [uuid()] },
      db,
    );

    expect(result).toEqual([]);
  });
});

describe("guards", () => {
  test("transfers excluded", async () => {
    await insertTransaction(db, householdId, accountId, {
      date: "2026-03-10",
      normalizedAmount: -50000,
      amount: 50000,
      categoryId: foodCatId,
      name: "Transfer",
      isTransfer: true,
    });

    const { getSpendingByCategory } = await import("../../src/queries/reports");
    const result = await getSpendingByCategory(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);
    const food = result.find((r) => r.categoryName === "Food");
    expect(food?.total).toBe(8000);
  });

  test("pending transactions excluded", async () => {
    await insertTransaction(db, householdId, accountId, {
      date: "2026-03-10",
      normalizedAmount: -9999,
      amount: 9999,
      categoryId: foodCatId,
      name: "Pending",
      pending: true,
    });

    const { getSpendingByCategory } = await import("../../src/queries/reports");
    const result = await getSpendingByCategory(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);
    const food = result.find((r) => r.categoryName === "Food");
    expect(food?.total).toBe(8000);
  });

  test("account filter narrows results", async () => {
    const { accountId: otherAcctId } = await insertAccount(db, householdId, { name: "Savings", type: "savings" });
    await insertTransaction(db, householdId, otherAcctId, {
      date: "2026-03-10",
      normalizedAmount: -7000,
      amount: 7000,
      categoryId: foodCatId,
      name: "Other Acct Food",
    });

    const { getSpendingByCategory } = await import("../../src/queries/reports");
    const result = await getSpendingByCategory(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31", accountIds: [accountId] }, db);
    const food = result.find((r) => r.categoryName === "Food");
    expect(food?.total).toBe(8000);
  });

  test("income categories excluded from spending", async () => {
    const { getSpendingByCategory } = await import("../../src/queries/reports");
    const result = await getSpendingByCategory(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    const salary = result.find((r) => r.categoryName === "Salary");
    expect(salary).toBeUndefined();

    const food = result.find((r) => r.categoryName === "Food");
    expect(food?.total).toBe(8000);
  });

  test("split transactions attributed to split categories", async () => {
    const { transactionId: splitParentId } = await insertTransaction(db, householdId, accountId, {
      date: "2026-03-25",
      normalizedAmount: -10000,
      amount: 10000,
      categoryId: foodCatId,
      name: "Split Purchase",
    });

    await insertTransactionSplit(db, splitParentId, foodCatId, 6000);
    await insertTransactionSplit(db, splitParentId, rentCatId, 4000);

    const { getSpendingByCategory } = await import("../../src/queries/reports");
    const result = await getSpendingByCategory(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    const food = result.find((r) => r.categoryName === "Food");
    const rent = result.find((r) => r.categoryName === "Rent");
    expect(food?.total).toBe(14000);
    expect(rent?.total).toBe(104000);
  });
});

describe("countAccountsStartingAfter", () => {
  test("counts accounts whose first transaction is after the date", async () => {
    const { accountId: lateAccount } = await insertAccount(db, householdId);
    await insertTransaction(db, householdId, lateAccount, { date: "2026-03-20", normalizedAmount: -1000, amount: 1000, categoryId: foodCatId, name: "Late" });

    const { countAccountsStartingAfter } = await import("../../src/queries/reports");
    // The seed account's history starts 2026-02-10; the new one 2026-03-20.
    expect(await countAccountsStartingAfter(householdId, "2026-03-01", undefined, db)).toEqual({ late: 1, total: 2 });
    expect(await countAccountsStartingAfter(householdId, "2026-01-01", undefined, db)).toEqual({ late: 2, total: 2 });
  });

  test("respects the account filter", async () => {
    const { accountId: lateAccount } = await insertAccount(db, householdId);
    await insertTransaction(db, householdId, lateAccount, { date: "2026-03-20", normalizedAmount: -1000, amount: 1000, categoryId: foodCatId, name: "Late" });

    const { countAccountsStartingAfter } = await import("../../src/queries/reports");
    expect(await countAccountsStartingAfter(householdId, "2026-03-01", [accountId], db)).toEqual({ late: 0, total: 1 });
  });
});
