import { describe, it, expect } from "vitest";
import { categoryPillLabel } from "./category-pill-label";

describe("categoryPillLabel", () => {
  it("shows the category name when one is assigned", () => {
    expect(categoryPillLabel("Restaurants", false)).toEqual({
      text: "Restaurants",
      variant: "category",
    });
  });

  it("labels an uncategorized transfer as Transfer, not Uncategorized", () => {
    expect(categoryPillLabel(null, true)).toEqual({
      text: "Transfer",
      variant: "transfer",
    });
  });

  it("labels a genuinely uncategorized (non-transfer) row as Uncategorized", () => {
    expect(categoryPillLabel(null, false)).toEqual({
      text: "Uncategorized",
      variant: "uncategorized",
    });
  });

  it("prefers an assigned category name even for a transfer", () => {
    // A user can still categorize a transfer; the real category wins.
    expect(categoryPillLabel("Credit Card Payment", true)).toEqual({
      text: "Credit Card Payment",
      variant: "category",
    });
  });

  it("labels investment-account activity as Investment, not Transfer", () => {
    expect(categoryPillLabel(null, true, "investment_account")).toEqual({
      text: "Investment",
      variant: "investment",
    });
  });

  it("prefers an assigned category name even for investment-account activity", () => {
    expect(categoryPillLabel("Dividends", true, "investment_account")).toEqual({
      text: "Dividends",
      variant: "category",
    });
  });
});
