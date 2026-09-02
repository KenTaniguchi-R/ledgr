import { CHART_COLORS } from "@/lib/chart-colors";

/**
 * How many categories Trends will plot at once.
 *
 * The palette's eight slots are spaced for *adjacent* pairs — a legend read top
 * to bottom, like the donut's. Overlapping lines are read against every other
 * line, and under the all-pairs check the palette fails hard: worst ΔE 1.6
 * (deutan) and 7.1 for normal vision, well under the floor of 15. Every 5- and
 * 6-colour subset was tested in both themes and none passes, so four is the
 * ceiling, not a preference. The previous limit was ten against eight slots,
 * which guaranteed the 9th and 10th lines repeated the 1st and 2nd outright.
 */
export const MAX_TREND_SERIES = 4;

/**
 * A category's colour, fixed to the category itself rather than to its position
 * among whatever happens to be selected. Colouring by the filtered list meant
 * unchecking one category repainted all the others, so a line changed colour
 * without changing meaning.
 *
 * More categories exist than the palette has slots, so two selected categories
 * eight apart still land on the same hue. The chart labels each line at its
 * right-hand end for exactly that reason: identity never rests on colour alone.
 */
export function trendSeriesColor(allNames: readonly string[], name: string): string {
  const index = allNames.indexOf(name);
  if (index === -1) return "var(--chart-neutral)";
  return CHART_COLORS[index % CHART_COLORS.length];
}
