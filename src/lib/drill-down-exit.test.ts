import { describe, expect, it } from "vitest";
import { drillDownExitReason } from "./drill-down-exit";

const row = {
  categoryId: null as string | null,
  categoryName: null as string | null,
  isTransfer: false,
  isHidden: false,
  normalizedAmount: -5000,
  transferSource: null as string | null,
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
    const edited = { ...row, categoryId: "c2", categoryName: "Travel", isTransfer: true, isHidden: true };
    expect(drillDownExitReason(edited, null)).toBe("Hidden");
    expect(drillDownExitReason({ ...edited, isHidden: false }, null)).toBe("Excluded from spend");
  });

  describe("transfers and the spending opt-in", () => {
    const rent = { ...row, categoryId: "rent", categoryName: "Rent (Zelle)", isTransfer: true };
    const optedIn = new Set(["rent"]);

    it("excludes a transfer by default", () => {
      expect(drillDownExitReason(rent, "rent")).toBe("Excluded from spend");
    });

    it("keeps an outgoing transfer in an opted-in category", () => {
      expect(drillDownExitReason(rent, "rent", optedIn)).toBeNull();
    });

    it("still excludes a transfer in a category that has not opted in", () => {
      expect(drillDownExitReason({ ...rent, categoryId: "other" }, undefined, optedIn)).toBe("Excluded from spend");
    });

    it("still excludes an incoming transfer in an opted-in category", () => {
      expect(drillDownExitReason({ ...rent, normalizedAmount: 5000 }, "rent", optedIn)).toBe("Excluded from spend");
    });

    it("never keeps brokerage activity", () => {
      expect(
        drillDownExitReason({ ...rent, transferSource: "investment_account" }, "rent", optedIn),
      ).toBe("Excluded from spend");
    });
  });
});
