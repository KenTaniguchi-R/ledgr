import { describe, expect, it } from "vitest";
import { drillDownExitReason } from "./drill-down-exit";

const row = {
  categoryId: null as string | null,
  categoryName: null as string | null,
  isTransfer: false,
  isHidden: false,
};

describe("drillDownExitReason", () => {
  it("keeps an untouched row in the Uncategorized drill-down", () => {
    expect(drillDownExitReason(row, null)).toBeNull();
  });

  it("reports a row categorized out of Uncategorized", () => {
    expect(
      drillDownExitReason({ ...row, categoryId: "c1", categoryName: "Groceries" }, null),
    ).toBe("Moved to Groceries");
  });

  it("reports a row uncategorized out of a category drill-down", () => {
    expect(drillDownExitReason(row, "c1")).toBe("Moved to Uncategorized");
  });

  it("ignores category changes when the drill-down has no category constraint", () => {
    expect(drillDownExitReason({ ...row, categoryId: "c2", categoryName: "Travel" }, undefined)).toBeNull();
  });

  it("puts hidden before excluded before category", () => {
    const edited = { categoryId: "c2", categoryName: "Travel", isTransfer: true, isHidden: true };
    expect(drillDownExitReason(edited, null)).toBe("Hidden");
    expect(drillDownExitReason({ ...edited, isHidden: false }, null)).toBe("Excluded from spend");
  });
});
