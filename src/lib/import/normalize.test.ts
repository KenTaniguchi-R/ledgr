import { describe, test, expect } from "vitest";
import { normalizeImportedRows } from "./normalize";
import type { ValidatedMapping } from "./mapper";

describe("normalizeImportedRows", () => {
  const mapping: ValidatedMapping = { date: "Date", amount: "Amount", description: "Description" };
  const accountId = "acc-1";
  const householdId = "hh-1";

  test("converts amount to cents in positive_is_expense convention", () => {
    const rows = [{ Date: "2024-01-15", Amount: "-5.50", Description: "Coffee" }];
    const result = normalizeImportedRows(rows, mapping, accountId, householdId, "positive_is_expense");
    expect(result[0].amount).toBe(-550);
  });

  test("flips sign when positive_is_income convention", () => {
    const rows = [{ Date: "2024-01-15", Amount: "50.00", Description: "Paycheck" }];
    const result = normalizeImportedRows(rows, mapping, accountId, householdId, "positive_is_income");
    expect(result[0].amount).toBe(-5000);
  });

  test("handles split credit/debit columns", () => {
    const splitMapping: ValidatedMapping = { date: "Date", credit: "Credit", debit: "Debit", description: "Desc" };
    const rows = [
      { Date: "2024-01-15", Credit: "", Debit: "25.50", Desc: "Coffee" },
      { Date: "2024-01-16", Credit: "100.00", Debit: "", Desc: "Refund" },
    ];
    const result = normalizeImportedRows(rows, splitMapping, accountId, householdId, "positive_is_expense");
    expect(result[0].amount).toBe(2550);
    expect(result[1].amount).toBe(-10000);
  });

  test("parses various date formats", () => {
    const rows = [
      { Date: "01/15/2024", Amount: "10", Description: "A" },
      { Date: "2024-01-15", Amount: "10", Description: "B" },
    ];
    const result = normalizeImportedRows(rows, mapping, accountId, householdId, "positive_is_expense");
    expect(result[0].date).toBe("2024-01-15");
    expect(result[1].date).toBe("2024-01-15");
  });

  test("generates unique IDs and applies householdId", () => {
    const rows = [{ Date: "2024-01-15", Amount: "10", Description: "Test" }];
    const result = normalizeImportedRows(rows, mapping, accountId, householdId, "positive_is_expense");
    expect(result[0].id).toHaveLength(36);
    expect(result[0].householdId).toBe(householdId);
    expect(result[0].accountId).toBe(accountId);
  });
});
