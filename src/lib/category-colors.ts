import { CHART_COLORS } from "@/lib/chart-colors";

/** Key for the uncategorized bucket, matching `aggregateSpending`'s map. */
export const UNCATEGORIZED_KEY = "uncategorized";

/** Neutral for Uncategorized (drawn hatched) and for the collapsed "Other" tail. */
export const NEUTRAL_CATEGORY_COLOR = "var(--chart-neutral)";

/** Category id (or `UNCATEGORIZED_KEY`) → CSS colour. */
export type CategoryColorMap = Record<string, string>;

/**
 * One colour per category for the whole Reports page.
 *
 * Each tab used to colour by its own row index, so Education was blue on
 * Spending and pink on Cash Flow, and Uncategorized was grey on one tab and
 * blue on the next. The map is built once per request from the range's spend
 * ranking and handed to every tab, so a category keeps its colour wherever it
 * appears. The eight palette slots go to the eight largest real categories;
 * Uncategorized never takes a slot, and the tail shares the neutral.
 */
export function buildCategoryColorMap(spending: ReadonlyMap<string, number>): CategoryColorMap {
  const ranked = [...spending.entries()]
    .filter(([key]) => key !== UNCATEGORIZED_KEY)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const map: CategoryColorMap = { [UNCATEGORIZED_KEY]: NEUTRAL_CATEGORY_COLOR };
  ranked.forEach(([key], i) => {
    map[key] = i < CHART_COLORS.length ? CHART_COLORS[i] : NEUTRAL_CATEGORY_COLOR;
  });
  return map;
}

/** Colour for a category id; `null` is uncategorized. Unknown ids get the neutral. */
export function categoryColor(map: CategoryColorMap, categoryId: string | null): string {
  return map[categoryId ?? UNCATEGORIZED_KEY] ?? NEUTRAL_CATEGORY_COLOR;
}
