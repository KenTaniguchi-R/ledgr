import { describe, it, expect } from "vitest";
import { axisTickFormatter } from "./money";

/**
 * Lives in its own file rather than money.test.ts so the chart-axis concern is
 * findable — money.test.ts is already long and about conversion, not display.
 */
describe("axisTickFormatter", () => {
  describe("wide domains keep the compact form", () => {
    it.each([
      [[0, 10_000_00], 100_000, "$1K"],
      [[0, 500_000_00], 5_294_244, "$52.9K"],
      [[0, 900_000_000], 1_500_000_00, "$1.5M"],
    ])("spread %j formats %d as %s", (values, cents, expected) => {
      expect(axisTickFormatter(values as number[])(cents)).toBe(expected);
    });
  });

  describe("narrow domains switch to whole dollars", () => {
    // A two-day window on a near-flat series spans less than the $100 that the
    // compact form resolves to, so every tick rendered identically — the axis
    // printed "$52.9K" four times.
    it("distinguishes ticks the compact form would collapse", () => {
      const format = axisTickFormatter([5_294_244, 5_294_244]);
      expect(format(5_294_244)).toBe("$52,942");
      expect(format(5_295_244)).toBe("$52,952");
    });

    it("groups thousands with separators", () => {
      expect(axisTickFormatter([100, 200])(1_234_567_89)).toBe("$1,234,568");
    });

    it("keeps the sign on negatives", () => {
      expect(axisTickFormatter([100, 200])(-5_294_244)).toBe("-$52,942");
    });

    it("rounds to the nearest dollar rather than truncating", () => {
      expect(axisTickFormatter([100, 200])(1_50)).toBe("$2");
      expect(axisTickFormatter([100, 200])(1_49)).toBe("$1");
    });
  });

  describe("the threshold between the two", () => {
    // $100 is exactly the compact form's resolution, so it is the boundary.
    it("uses compact at exactly $100 of spread", () => {
      expect(axisTickFormatter([0, 100_00])(5_294_244)).toBe("$52.9K");
    });

    it("uses whole dollars just below $100 of spread", () => {
      expect(axisTickFormatter([0, 99_99])(5_294_244)).toBe("$52,942");
    });
  });

  describe("degenerate inputs", () => {
    it("falls back to compact for an empty series", () => {
      // No data means no domain to measure; the chart renders its empty state
      // anyway, so the formatter just must not throw.
      expect(axisTickFormatter([])(5_294_244)).toBe("$52.9K");
    });

    it("treats a single point as a zero spread", () => {
      expect(axisTickFormatter([5_294_244])(5_294_244)).toBe("$52,942");
    });

    it("measures spread regardless of value order", () => {
      // Max/min, not first/last — a descending series has the same spread.
      expect(axisTickFormatter([500_000_00, 0])(5_294_244)).toBe("$52.9K");
      expect(axisTickFormatter([0, 500_000_00])(5_294_244)).toBe("$52.9K");
    });

    it("handles a domain spanning zero", () => {
      expect(axisTickFormatter([-300_000_00, 600_000_00])(5_294_244)).toBe("$52.9K");
    });
  });
});
