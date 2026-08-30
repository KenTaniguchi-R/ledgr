import { describe, it, expect } from "vitest";
import { uncategorizedShare, type SpendingSlice } from "./uncategorized-share";

const row = (categoryId: string | null, total: number): SpendingSlice => ({ categoryId, total });

describe("uncategorizedShare", () => {
  it("reports the amount, the two denominators, and the share of total spend", () => {
    const share = uncategorizedShare([
      row("clothing", 131593),
      row(null, 105729),
      row("restaurants", 96200),
    ]);

    expect(share).toEqual({
      amount: 105729,
      total: 333522,
      categorized: 227793,
      pct: 31.7,
    });
  });

  it("returns null when every row carries a category", () => {
    expect(uncategorizedShare([row("clothing", 131593), row("restaurants", 96200)])).toBeNull();
  });

  it("returns null for an empty month", () => {
    expect(uncategorizedShare([])).toBeNull();
  });

  it("returns null when the uncategorized bucket exists but is empty", () => {
    // Nothing to act on — surfacing a zero-value nudge would be noise.
    expect(uncategorizedShare([row("clothing", 131593), row(null, 0)])).toBeNull();
  });

  it("does not divide by zero when the only row is an empty uncategorized bucket", () => {
    expect(uncategorizedShare([row(null, 0)])).toBeNull();
  });

  it("reports 100% when nothing at all is categorized", () => {
    expect(uncategorizedShare([row(null, 50000)])).toEqual({
      amount: 50000,
      total: 50000,
      categorized: 0,
      pct: 100,
    });
  });

  it("sums multiple uncategorized rows if a caller ever supplies them", () => {
    const share = uncategorizedShare([row(null, 1000), row(null, 500), row("groceries", 8500)]);
    expect(share?.amount).toBe(1500);
    expect(share?.categorized).toBe(8500);
  });

  it("rounds the percentage to one decimal place", () => {
    // 1/3 of spend — the raw value is 33.333...
    expect(uncategorizedShare([row(null, 100), row("x", 200)])?.pct).toBe(33.3);
  });

  it("ignores negative totals rather than producing a nonsense share", () => {
    // Spending aggregates are absolute values; a negative is a data fault, not
    // a refund. Treat it as absent instead of letting it skew the denominator.
    expect(uncategorizedShare([row(null, -500), row("x", 1000)])).toBeNull();
  });

  describe("categorized always reconciles to total minus amount", () => {
    it.each([
      [[row(null, 1), row("a", 1)]],
      [[row(null, 999999), row("a", 1), row("b", 2)]],
      [[row(null, 33333), row("a", 66667)]],
    ])("case %#", (rows) => {
      const share = uncategorizedShare(rows)!;
      expect(share.categorized).toBe(share.total - share.amount);
    });
  });
});
