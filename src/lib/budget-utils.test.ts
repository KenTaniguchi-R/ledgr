import { describe, it, expect } from "vitest";
import { test, fc } from "@fast-check/vitest";
import { budgetProgressPercent } from "./budget-utils";

describe("budgetProgressPercent", () => {
  it("returns percentage for normal case", () => {
    expect(budgetProgressPercent(5000, 10000)).toBe(50);
  });

  it("returns 0 when both spent and limit are 0", () => {
    expect(budgetProgressPercent(0, 0)).toBe(0);
  });

  it("returns 100 when spent > 0 and limit is 0", () => {
    expect(budgetProgressPercent(5000, 0)).toBe(100);
  });

  it("returns value > 100 when overspent", () => {
    expect(budgetProgressPercent(15000, 10000)).toBe(150);
  });

  it("returns 0 when spent is 0", () => {
    expect(budgetProgressPercent(0, 10000)).toBe(0);
  });

  test.prop([fc.nat(1_000_000), fc.nat(1_000_000)])(
    "percentage is always >= 0",
    (spent, limit) => {
      expect(budgetProgressPercent(spent, limit)).toBeGreaterThanOrEqual(0);
    },
  );

  test.prop([fc.integer({ min: 1, max: 1_000_000 }), fc.integer({ min: 1, max: 1_000_000 })])(
    "percentage >= 100 when spent >= limit",
    (base, extra) => {
      const limit = base;
      const spent = base + extra;
      expect(budgetProgressPercent(spent, limit)).toBeGreaterThanOrEqual(100);
    },
  );
});
