/**
 * Date-range presets for the transactions filter bar.
 *
 * The filter bar exposes a single Date popover: a set of named presets
 * (this month, last 30 days, ...) plus a custom From/To range. These pure
 * helpers compute the `from`/`to` text-date params (YYYY-MM-DD, local) for a
 * preset and, in reverse, figure out which preset (if any) a given range maps
 * back to so the trigger can render the right label.
 */

export type DatePresetId = "7d" | "30d" | "month" | "3m" | "year";

export interface DatePreset {
  id: DatePresetId;
  label: string;
}

export const DATE_PRESETS: DatePreset[] = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "month", label: "This month" },
  { id: "3m", label: "Last 3 months" },
  { id: "year", label: "This year" },
];

/** Format a Date as a local YYYY-MM-DD string (matches formatDateShort's local-midnight convention). */
function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The { from, to } range a preset resolves to, relative to `today`. */
export function dateRangeForPreset(
  id: DatePresetId,
  today: Date = new Date(),
): { from: string; to: string } {
  const to = toDateString(today);
  const from = new Date(today);
  switch (id) {
    case "7d":
      from.setDate(from.getDate() - 7);
      break;
    case "30d":
      from.setDate(from.getDate() - 30);
      break;
    case "month":
      from.setDate(1);
      break;
    case "3m":
      from.setMonth(from.getMonth() - 3);
      break;
    case "year":
      from.setMonth(0, 1); // January 1st of the current year
      break;
  }
  return { from: toDateString(from), to };
}

/**
 * Which preset the current from/to params correspond to.
 * - `null`      → no date filter active (both params absent)
 * - a preset id → the range exactly matches that preset
 * - `"custom"`  → a range is set but matches no preset
 */
export function matchDatePreset(
  from: string | null,
  to: string | null,
  today: Date = new Date(),
): DatePresetId | "custom" | null {
  if (!from && !to) return null;
  for (const preset of DATE_PRESETS) {
    const range = dateRangeForPreset(preset.id, today);
    if (range.from === from && range.to === to) return preset.id;
  }
  return "custom";
}
