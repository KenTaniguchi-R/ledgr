import { describe, it, expect } from "vitest";
import { pctChange, savingsRatePct, trendDelta } from "./stat-delta";

describe("pctChange", () => {
  it("computes percent change against the previous value", () => {
    expect(pctChange(110, 100)).toBeCloseTo(10);
    expect(pctChange(90, 100)).toBeCloseTo(-10);
  });

  it("uses the previous magnitude when the previous value is negative", () => {
    // Net worth going from -1000 to -500 improved by 50%
    expect(pctChange(-500, -1000)).toBeCloseTo(50);
  });

  it("returns null when the previous value is zero", () => {
    expect(pctChange(500, 0)).toBeNull();
  });
});

describe("savingsRatePct", () => {
  it("returns net as a percentage of income", () => {
    expect(savingsRatePct({ monthlyIncome: 800000, monthlyNet: 200000 })).toBeCloseTo(25);
  });

  it("returns null when income is zero or negative", () => {
    expect(savingsRatePct({ monthlyIncome: 0, monthlyNet: 0 })).toBeNull();
    expect(savingsRatePct({ monthlyIncome: -100, monthlyNet: -100 })).toBeNull();
  });
});

describe("trendDelta", () => {
  it("computes diff and pct between first and last points", () => {
    const d = trendDelta([100000, 105000, 110000]);
    expect(d).toEqual({ diff: 10000, pct: 10 });
  });

  it("returns null pct when the series starts at zero", () => {
    const d = trendDelta([0, 5000]);
    expect(d).toEqual({ diff: 5000, pct: null });
  });

  it("returns null for series with fewer than two points", () => {
    expect(trendDelta([])).toBeNull();
    expect(trendDelta([100])).toBeNull();
  });
});
