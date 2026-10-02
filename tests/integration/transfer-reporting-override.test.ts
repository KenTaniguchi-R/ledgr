import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { LedgrDb } from "../../src/db";
import {
  insertAccount,
  insertCategory,
  insertCategoryGroup,
  insertHousehold,
  insertTransaction,
} from "./helpers";
import { createTestDb } from "./setup";

const RANGE = { dateFrom: "2026-09-01", dateTo: "2026-09-30" };

describe("category transfer reporting override", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;
  let householdId: string;
  let accountId: string;
  let ordinaryCategoryId: string;
  let cardPaymentCategoryId: string;
  let debtCategoryId: string;
  let incomeCategoryId: string;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    ({ householdId } = await insertHousehold(db, "Primary"));
    ({ accountId } = await insertAccount(db, householdId));

    const { groupId } = await insertCategoryGroup(db, householdId, { name: "Expenses" });
    ({ categoryId: ordinaryCategoryId } = await insertCategory(db, householdId, groupId, {
      name: "Everyday",
    }));
    ({ categoryId: cardPaymentCategoryId } = await insertCategory(db, householdId, groupId, {
      name: "Card payment",
      includeTransferInSpending: false,
      includeTransferInCashFlow: true,
    }));
    ({ categoryId: debtCategoryId } = await insertCategory(db, householdId, groupId, {
      name: "Installment payment",
      includeTransferInSpending: true,
      includeTransferInCashFlow: false,
    }));

    const { groupId: incomeGroupId } = await insertCategoryGroup(db, householdId, {
      name: "Income",
    });
    ({ categoryId: incomeCategoryId } = await insertCategory(db, householdId, incomeGroupId, {
      name: "Pay",
      isIncome: true,
    }));

    await insertTransaction(db, householdId, accountId, {
      date: "2026-09-02",
      normalizedAmount: -1000,
      amount: 1000,
      categoryId: ordinaryCategoryId,
      name: "Ordinary expense",
    });
    await insertTransaction(db, householdId, accountId, {
      date: "2026-09-03",
      normalizedAmount: -2000,
      amount: 2000,
      categoryId: ordinaryCategoryId,
      name: "Ordinary transfer",
      isTransfer: true,
    });
    await insertTransaction(db, householdId, accountId, {
      date: "2026-09-04",
      normalizedAmount: -3000,
      amount: 3000,
      categoryId: cardPaymentCategoryId,
      name: "Payment transfer",
      isTransfer: true,
      transferPairId: "paired-card-row",
    });
    await insertTransaction(db, householdId, accountId, {
      date: "2026-09-05",
      normalizedAmount: -4000,
      amount: 4000,
      categoryId: debtCategoryId,
      name: "Debt payment",
      isTransfer: true,
      transferPairId: "paired-debt-row",
    });
    await insertTransaction(db, householdId, accountId, {
      date: "2026-09-05",
      normalizedAmount: -6000,
      amount: 6000,
      categoryId: debtCategoryId,
      name: "Paired non-transfer row",
      isTransfer: false,
      transferPairId: "paired-non-transfer-row",
    });
    await insertTransaction(db, householdId, accountId, {
      date: "2026-09-06",
      normalizedAmount: 10000,
      amount: -10000,
      categoryId: incomeCategoryId,
      name: "Paycheck",
    });
    await insertTransaction(db, householdId, accountId, {
      date: "2026-09-07",
      normalizedAmount: 8000,
      amount: -8000,
      categoryId: cardPaymentCategoryId,
      name: "Positive payment transfer",
      isTransfer: true,
    });
    await insertTransaction(db, householdId, accountId, {
      date: "2026-09-07",
      normalizedAmount: 9000,
      amount: -9000,
      categoryId: incomeCategoryId,
      name: "Income transfer",
      isTransfer: true,
    });

    const { householdId: otherHouseholdId } = await insertHousehold(db, "Other");
    const { groupId: otherGroupId } = await insertCategoryGroup(db, otherHouseholdId);
    const { categoryId: otherOverrideCategoryId } = await insertCategory(
      db,
      otherHouseholdId,
      otherGroupId,
      { includeTransferInSpending: true, includeTransferInCashFlow: true },
    );
    await insertTransaction(db, householdId, accountId, {
      date: "2026-09-08",
      normalizedAmount: -7000,
      amount: 7000,
      categoryId: otherOverrideCategoryId,
      name: "Cross-household category",
      isTransfer: true,
    });
  });

  afterAll(async () => {
    await close();
  });

  test("includes only opted-in negative transfers and preserves ordinary spending", async () => {
    const { getSpendingByCategory } = await import("../../src/queries/reports");
    const rows = await getSpendingByCategory(householdId, RANGE, db);

    expect(rows.find((row) => row.categoryId === ordinaryCategoryId)?.total).toBe(1000);
    expect(rows.find((row) => row.categoryId === cardPaymentCategoryId)).toBeUndefined();
    expect(rows.find((row) => row.categoryId === debtCategoryId)?.total).toBe(4000);
    expect(rows.reduce((total, row) => total + row.total, 0)).toBe(5000);
  });

  test("uses the independent override for Cash Flow summary and Sankey", async () => {
    const { getCashFlowSankey, getCashFlowSummary, getIncomeVsExpense } = await import(
      "../../src/queries/reports"
    );

    const [month] = await getIncomeVsExpense(householdId, RANGE, db);
    expect(month).toMatchObject({ income: 10000, expenses: 5000, net: 5000 });

    const [cashFlow] = await getCashFlowSummary(householdId, RANGE, db);
    expect(cashFlow).toMatchObject({ income: 10000, expenses: 4000, net: 6000 });

    const { links } = await getCashFlowSankey(householdId, RANGE, db);
    expect(
      links
        .filter((link) => link.target === `expense-${cardPaymentCategoryId}`)
        .reduce((total, link) => total + link.value, 0),
    ).toBe(3000);
    expect(
      links
        .filter((link) => link.target === `expense-${debtCategoryId}`)
        .reduce((total, link) => total + link.value, 0),
    ).toBe(0);
    expect(
      links
        .filter((link) => link.target === "savings")
        .reduce((total, link) => total + link.value, 0),
    ).toBe(6000);
  });

  test("keeps Safe to Spend on ordinary spending semantics", async () => {
    const { getSafeToSpend } = await import("../../src/queries/reports");
    const result = await getSafeToSpend(householdId, db, "2026-09");

    expect(result).toMatchObject({
      monthlyIncome: 10000,
      recurringExpenses: 0,
      discretionarySpent: 5000,
      safeToSpend: 5000,
    });
  });

  test("does not honor an override category owned by another household", async () => {
    const { getCategoryTrends } = await import("../../src/queries/reports");
    const rows = await getCategoryTrends(householdId, RANGE, db);

    expect(rows.reduce((total, row) => total + row.total, 0)).toBe(5000);
  });
  test("uses Cash Flow inclusion for outflow drill-downs only", async () => {
    const { getDrillDownTransactions } = await import("../../src/queries/reports");

    const cashFlow = await getDrillDownTransactions(
      householdId,
      {
        ...RANGE,
        categoryId: cardPaymentCategoryId,
        type: "expense",
        reportContext: "cash-flow",
      },
      50,
      db,
    );
    const spending = await getDrillDownTransactions(
      householdId,
      { ...RANGE, categoryId: cardPaymentCategoryId, type: "expense" },
      50,
      db,
    );

    expect(cashFlow).toMatchObject({ total: 3000, matchCount: 1 });
    expect(spending).toMatchObject({ total: 0, matchCount: 0 });
  });
});
