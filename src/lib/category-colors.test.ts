import { describe, test, expect } from "vitest";
import { CHART_COLORS } from "@/lib/chart-colors";
import {
  buildCategoryColorMap,
  categoryColor,
  NEUTRAL_CATEGORY_COLOR,
  UNCATEGORIZED_KEY,
} from "./category-colors";

describe("buildCategoryColorMap", () => {
  test("gives palette slots to the largest real categories, never to Uncategorized", () => {
    const map = buildCategoryColorMap(
      new Map([
        ["rent", 3000],
        [UNCATEGORIZED_KEY, 9000],
        ["education", 5000],
      ]),
    );

    expect(map.education).toBe(CHART_COLORS[0]);
    expect(map.rent).toBe(CHART_COLORS[1]);
    expect(map[UNCATEGORIZED_KEY]).toBe(NEUTRAL_CATEGORY_COLOR);
  });

  test("the tail past the palette shares the neutral instead of repeating a hue", () => {
    const entries = Array.from({ length: CHART_COLORS.length + 2 }, (_, i) => [`c${i}`, 1000 - i] as const);
    const map = buildCategoryColorMap(new Map(entries));

    expect(map[`c${CHART_COLORS.length}`]).toBe(NEUTRAL_CATEGORY_COLOR);
    expect(new Set(entries.slice(0, CHART_COLORS.length).map(([k]) => map[k])).size).toBe(CHART_COLORS.length);
  });

  test("categoryColor treats null as uncategorized and unknown ids as neutral", () => {
    const map = buildCategoryColorMap(new Map([["food", 100]]));
    expect(categoryColor(map, null)).toBe(NEUTRAL_CATEGORY_COLOR);
    expect(categoryColor(map, "missing")).toBe(NEUTRAL_CATEGORY_COLOR);
    expect(categoryColor(map, "food")).toBe(CHART_COLORS[0]);
  });
});
