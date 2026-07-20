import { describe, test, expect } from "vitest";
import { normalizeImportedRows } from "./normalize";
import type { ValidatedMapping } from "./mapper";

describe("normalizeImportedRows", () => {
  const mapping: ValidatedMapping = { date: "Date", amount: "Amount", description: "Description" };
  const accountId = "acc-1";
  const householdId = "hh-1";

  test("converts amount to cents in positive_is_expense convention", () => {
    const rows = [{ Date: "2024-01-15", Amount: "-5.50", Description: "Coffee" }];
    const { rows: result } = normalizeImportedRows(rows, mapping, accountId, householdId, "positive_is_expense");
    expect(result[0].amount).toBe(-550);
  });

  test("flips sign when positive_is_income convention", () => {
    const rows = [{ Date: "2024-01-15", Amount: "50.00", Description: "Paycheck" }];
    const { rows: result } = normalizeImportedRows(rows, mapping, accountId, householdId, "positive_is_income");
    expect(result[0].amount).toBe(-5000);
  });

  test("handles split credit/debit columns", () => {
    const splitMapping: ValidatedMapping = { date: "Date", credit: "Credit", debit: "Debit", description: "Desc" };
    const rows = [
      { Date: "2024-01-15", Credit: "", Debit: "25.50", Desc: "Coffee" },
      { Date: "2024-01-16", Credit: "100.00", Debit: "", Desc: "Refund" },
    ];
    const { rows: result } = normalizeImportedRows(rows, splitMapping, accountId, householdId, "positive_is_expense");
    expect(result[0].amount).toBe(2550);
    expect(result[1].amount).toBe(-10000);
  });

  test("parses various date formats", () => {
    const rows = [
      { Date: "01/15/2024", Amount: "10", Description: "A" },
      { Date: "2024-01-15", Amount: "10", Description: "B" },
    ];
    const { rows: result } = normalizeImportedRows(rows, mapping, accountId, householdId, "positive_is_expense");
    expect(result[0].date).toBe("2024-01-15");
    expect(result[1].date).toBe("2024-01-15");
  });

  test("generates unique IDs and applies householdId", () => {
    const rows = [{ Date: "2024-01-15", Amount: "10", Description: "Test" }];
    const { rows: result } = normalizeImportedRows(rows, mapping, accountId, householdId, "positive_is_expense");
    expect(result[0].id).toHaveLength(36);
    expect(result[0].householdId).toBe(householdId);
    expect(result[0].accountId).toBe(accountId);
  });

  test("skips rows missing a date or description", () => {
    const rows = [
      { Date: "", Amount: "1.00", Description: "No date" },
      { Date: "2024-01-15", Amount: "1.00", Description: "" },
      { Date: "2024-01-15", Amount: "1.00", Description: "Kept" },
    ];
    const { rows: result } = normalizeImportedRows(rows, mapping, accountId, householdId, "positive_is_expense");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Kept");
  });

  test("trims surrounding whitespace from the description", () => {
    const rows = [{ Date: "2024-01-15", Amount: "1.00", Description: "  Coffee  " }];
    const { rows: result } = normalizeImportedRows(rows, mapping, accountId, householdId, "positive_is_expense");
    expect(result[0].name).toBe("Coffee");
    expect(result[0].originalName).toBe("Coffee");
  });

  test("skips a row with an unparseable amount instead of silently coercing to 0", () => {
    const rows = [
      { Date: "2024-01-15", Amount: "not-a-number", Description: "Garbage" },
      { Date: "2024-01-16", Amount: "10.00", Description: "Good" },
    ];
    const { rows: result, skipped } = normalizeImportedRows(rows, mapping, accountId, householdId, "positive_is_expense");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Good");
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toMatch(/amount/i);
  });

  test("skips a row with an unparseable debit/credit amount", () => {
    const splitMapping: ValidatedMapping = { date: "Date", credit: "Credit", debit: "Debit", description: "Desc" };
    const rows = [
      { Date: "2024-01-15", Credit: "", Debit: "garbage", Desc: "Bad debit" },
    ];
    const { rows: result, skipped } = normalizeImportedRows(rows, splitMapping, accountId, householdId, "positive_is_expense");
    expect(result).toHaveLength(0);
    expect(skipped).toHaveLength(1);
  });
});
