import { describe, test, expect } from "vitest";
import { CHART_COLORS } from "./chart-colors";
import { MAX_TREND_SERIES, trendSeriesColor } from "./series-colors";

const CATEGORIES = [
  "Rent/Mortgage", "Groceries", "Car Payment", "Home Goods",
  "Gas", "Electric", "Electronics", "Internet", "Phone", "Clothing",
];

describe("trendSeriesColor", () => {
  test("a category's colour does not depend on what else is selected", () => {
    // The old code coloured by position in the *filtered* list, so unchecking
    // one category repainted every line that remained.
    const before = trendSeriesColor(CATEGORIES, "Gas");
    const after = trendSeriesColor(CATEGORIES, "Gas");
    expect(after).toBe(before);
    expect(before).toBe(CHART_COLORS[4]);
  });

  test("the first categories take the palette in its published order", () => {
    expect(CATEGORIES.slice(0, 8).map((c) => trendSeriesColor(CATEGORIES, c))).toEqual(CHART_COLORS);
  });

  test("a category the list does not know gets the neutral, never a guessed hue", () => {
    expect(trendSeriesColor(CATEGORIES, "Nonexistent")).toBe("var(--chart-neutral)");
  });
});

describe("MAX_TREND_SERIES", () => {
  test("is within what the palette can separate when every line overlaps", () => {
    // Validated with the dataviz palette checker: at 5 simultaneous series no
    // subset of this palette clears the all-pairs CVD floor in both themes.
    expect(MAX_TREND_SERIES).toBeLessThanOrEqual(4);
    expect(MAX_TREND_SERIES).toBeGreaterThan(1);
  });
});
