import { describe, test, expect } from "vitest";
import { MAX_TREND_SERIES } from "./series-colors";

describe("MAX_TREND_SERIES", () => {
  test("is within what the palette can separate when every line overlaps", () => {
    // Validated with the dataviz palette checker: at 5 simultaneous series no
    // subset of this palette clears the all-pairs CVD floor in both themes.
    expect(MAX_TREND_SERIES).toBeLessThanOrEqual(4);
    expect(MAX_TREND_SERIES).toBeGreaterThan(1);
  });
});
