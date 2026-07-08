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
});

describe("getIncomeExpenseByCategory", () => {
  test("income sums abs amount, expense sums raw signed amount", async () => {
    const { getIncomeExpenseByCategory } = await import("../../src/queries/reports");
    const result = await getIncomeExpenseByCategory(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    const salary = result.find((r) => r.categoryName === "Salary");
    const food = result.find((r) => r.categoryName === "Food");
    const rent = result.find((r) => r.categoryName === "Rent");

    expect(salary?.isIncome).toBe(true);
    expect(salary?.total).toBe(500000); // abs of +500000
    expect(food?.isIncome).toBe(false);
    expect(food?.total).toBe(-8000); // raw signed (-5000 + -3000)
    expect(rent?.total).toBe(-100000); // raw signed
  });

  test("sorts rows by total descending", async () => {
    const { getIncomeExpenseByCategory } = await import("../../src/queries/reports");
    const result = await getIncomeExpenseByCategory(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    expect(result.map((r) => r.categoryName)).toEqual(["Salary", "Food", "Rent"]);
  });

  test("monthlyAverage divides by distinct month count; null-category months count in the divisor but rows are excluded", async () => {
    // A lone null-category txn in January adds a third distinct month to the
    // divisor even though it produces no output row.
    await insertTransaction(db, householdId, accountId, { date: "2026-01-20", normalizedAmount: -9999, amount: 9999, categoryId: null, name: "Uncat Jan" });

    const { getIncomeExpenseByCategory } = await import("../../src/queries/reports");
    const result = await getIncomeExpenseByCategory(householdId, { dateFrom: "2026-01-01", dateTo: "2026-03-31" }, db);

    // No row for the null-category transaction.
    expect(result.every((r) => r.categoryName !== "Uncat Jan")).toBe(true);

    // Food = Feb (-4000) + Mar (-8000) = -12000 over 3 distinct months.
    const food = result.find((r) => r.categoryName === "Food");
    expect(food?.total).toBe(-12000);
    expect(food?.monthlyAverage).toBe(Math.round(-12000 / 3)); // -4000
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
  test("income-only flow: negative non-income txns are not expenses, surplus routes to savings", async () => {
    // beforeEach data: Salary +500000 (income), Food/Rent with NEGATIVE
    // normalizedAmount. getCashFlowSankey counts an expense only when
    // normalizedAmount > 0, so Food/Rent contribute nothing here.
    const { getCashFlowSankey } = await import("../../src/queries/reports");
    const { nodes, links } = await getCashFlowSankey(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    expect(nodes.some((n) => n.id === `income-${incomeCatId}` && n.type === "income" && n.name === "Salary")).toBe(true);
    expect(nodes.some((n) => n.type === "expense")).toBe(false);
    expect(nodes.some((n) => n.id === "savings" && n.type === "savings")).toBe(true);

    // All income (500000) is surplus, routed 1:1 to savings.
    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({ source: `income-${incomeCatId}`, target: "savings", value: 500000 });
  });

  test("expenses use positive normalizedAmount, grouped per category, links split by income share", async () => {
    // Positive-normalizedAmount non-income txns are the sankey's "expenses".
    await insertTransaction(db, householdId, accountId, { date: "2026-03-06", normalizedAmount: 30000, amount: -30000, categoryId: foodCatId, name: "Food exp 1" });
    await insertTransaction(db, householdId, accountId, { date: "2026-03-07", normalizedAmount: 10000, amount: -10000, categoryId: foodCatId, name: "Food exp 2" });
    await insertTransaction(db, householdId, accountId, { date: "2026-03-08", normalizedAmount: 60000, amount: -60000, categoryId: rentCatId, name: "Rent exp" });

    const { getCashFlowSankey } = await import("../../src/queries/reports");
    const { nodes, links } = await getCashFlowSankey(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    // Food = 30000 + 10000 (negatives excluded), Rent = 60000. Income 500000.
    expect(nodes.some((n) => n.id === `expense-${foodCatId}` && n.type === "expense")).toBe(true);
    expect(nodes.some((n) => n.id === `expense-${rentCatId}` && n.type === "expense")).toBe(true);

    const share = 1; // single income category -> 100% share
    const foodLink = links.find((l) => l.target === `expense-${foodCatId}`);
    const rentLink = links.find((l) => l.target === `expense-${rentCatId}`);
    const savingsLink = links.find((l) => l.target === "savings");
    expect(foodLink?.value).toBe(Math.round(40000 * share));
    expect(rentLink?.value).toBe(Math.round(60000 * share));
    // surplus = 500000 - 100000 = 400000
    expect(savingsLink?.value).toBe(Math.round(400000 * share));
  });

  test("income category sums ABS regardless of sign", async () => {
    // A negative-signed income txn (e.g. a reversal) still adds |amount|.
    await insertTransaction(db, householdId, accountId, { date: "2026-03-09", normalizedAmount: -100000, amount: 100000, categoryId: incomeCatId, name: "Income reversal" });

    const { getCashFlowSankey } = await import("../../src/queries/reports");
    const { links } = await getCashFlowSankey(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    // Income pool = |500000| + |-100000| = 600000, all surplus -> savings.
    const savingsLink = links.find((l) => l.target === "savings");
    expect(savingsLink?.value).toBe(600000);
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
    await insertBalance(creditId, "2026-04-01", 15000);
    await insertBalance(accountId, "2026-04-15", 80000);

    const { getReportNetWorthHistory } = await import("../../src/queries/reports");
    const result = await getReportNetWorthHistory(householdId, { dateFrom: "2026-04-01", dateTo: "2026-04-30" }, db);

    expect(result.map((r) => r.date)).toEqual(["2026-04-01", "2026-04-15"]);

    const d1 = result.find((r) => r.date === "2026-04-01")!;
    expect(d1.assets).toBe(100000); // checking 70000 + savings 30000
    expect(d1.liabilities).toBe(15000); // credit
    expect(d1.netWorth).toBe(85000);

    const d2 = result.find((r) => r.date === "2026-04-15")!;
    expect(d2.assets).toBe(80000);
    expect(d2.liabilities).toBe(0);
    expect(d2.netWorth).toBe(80000);
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
