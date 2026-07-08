import { describe, it, expect } from "vitest";
import { dateRangeForPreset, matchDatePreset, DATE_PRESETS } from "./date-presets";

// Fixed reference point: Tuesday, July 7 2026 (local time).
const TODAY = new Date(2026, 6, 7);

describe("dateRangeForPreset", () => {
  it("computes rolling day windows ending today", () => {
    expect(dateRangeForPreset("7d", TODAY)).toEqual({ from: "2026-06-30", to: "2026-07-07" });
    expect(dateRangeForPreset("30d", TODAY)).toEqual({ from: "2026-06-07", to: "2026-07-07" });
    expect(dateRangeForPreset("3m", TODAY)).toEqual({ from: "2026-04-07", to: "2026-07-07" });
  });

  it("anchors 'this month' to the first of the current month", () => {
    expect(dateRangeForPreset("month", TODAY)).toEqual({ from: "2026-07-01", to: "2026-07-07" });
  });

  it("anchors 'this year' to January 1st", () => {
    expect(dateRangeForPreset("year", TODAY)).toEqual({ from: "2026-01-01", to: "2026-07-07" });
  });
});

describe("matchDatePreset", () => {
  it("returns null when no date range is set", () => {
    expect(matchDatePreset(null, null, TODAY)).toBeNull();
  });

  it("round-trips every preset back to its id", () => {
    for (const preset of DATE_PRESETS) {
      const { from, to } = dateRangeForPreset(preset.id, TODAY);
      expect(matchDatePreset(from, to, TODAY)).toBe(preset.id);
    }
  });

  it("labels a range matching no preset as custom", () => {
    expect(matchDatePreset("2020-01-01", "2026-07-07", TODAY)).toBe("custom");
  });

  it("treats a one-sided range as custom", () => {
    expect(matchDatePreset("2026-07-01", null, TODAY)).toBe("custom");
  });
});
