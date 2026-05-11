import { describe, it, expect } from "vitest";
import { parseTransactionFilters } from "./parse-transaction-filters";

describe("parseTransactionFilters", () => {
  it("parses valid filter params", () => {
    const result = parseTransactionFilters({
      account: "acc-1",
      category: "cat-1",
      from: "2026-01-01",
      to: "2026-03-31",
      q: "coffee",
      type: "expense",
      amountMin: "500",
      amountMax: "10000",
    });

    expect(result.isReviewMode).toBe(false);
    expect(result.filters).toEqual({
      accountId: "acc-1",
      categoryId: "cat-1",
      dateFrom: "2026-01-01",
      dateTo: "2026-03-31",
      search: "coffee",
      reviewed: undefined,
      transactionType: "expense",
      amountMin: 500,
      amountMax: 10000,
    });
  });

  it("handles uncategorized as null categoryId", () => {
    const { filters } = parseTransactionFilters({ category: "uncategorized" });
    expect(filters.categoryId).toBeNull();
  });

  it("ignores invalid amounts (negative, NaN)", () => {
    const { filters } = parseTransactionFilters({
      amountMin: "-100",
      amountMax: "not-a-number",
    });
    expect(filters.amountMin).toBeUndefined();
    expect(filters.amountMax).toBeUndefined();
  });

  it("ignores unknown transaction type values", () => {
    const { filters } = parseTransactionFilters({ type: "invalid" });
    expect(filters.transactionType).toBeUndefined();
  });

  it("sets reviewed=false in review mode", () => {
    const result = parseTransactionFilters({ mode: "review" });
    expect(result.isReviewMode).toBe(true);
    expect(result.filters.reviewed).toBe(false);
  });

  it("treats empty/missing params as undefined filters", () => {
    const { filters } = parseTransactionFilters({});
    expect(filters.accountId).toBeUndefined();
    expect(filters.categoryId).toBeUndefined();
    expect(filters.search).toBeUndefined();
    expect(filters.dateFrom).toBeUndefined();
    expect(filters.dateTo).toBeUndefined();
    expect(filters.amountMin).toBeUndefined();
    expect(filters.amountMax).toBeUndefined();
    expect(filters.transactionType).toBeUndefined();
    expect(filters.reviewed).toBeUndefined();
  });
});
