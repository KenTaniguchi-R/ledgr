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
