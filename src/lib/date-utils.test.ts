import { describe, test, expect, vi, afterEach } from "vitest";
import { test as fcTest } from "@fast-check/vitest";
import { fc } from "@fast-check/vitest";
import { rangeToDateBounds, monthBounds, shiftDateRange, comparisonLabel, formatTxnSpan, todayDateString, formatDateShort } from "./date-utils";

describe("todayDateString", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("returns the local calendar date", () => {
    const now = new Date();
    const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(todayDateString()).toBe(local);
  });

  test("follows the local calendar date, not the UTC date, at a UTC day boundary", () => {
    vi.useFakeTimers();
    // Just past midnight UTC: west of UTC this is still the previous local day.
    // Asserting against runtime-derived local getters keeps this deterministic in
    // any runner timezone (CI runs UTC; a dev machine may be Pacific) — a
    // regression to `new Date().toISOString().slice(0,10)` is caught whenever the
    // runner's local date differs from the UTC date.
    vi.setSystemTime(new Date("2026-01-01T02:00:00Z"));
    const now = new Date();
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const utcDate = now.toISOString().slice(0, 10);

    expect(todayDateString()).toBe(localDate);
    if (localDate !== utcDate) {
      expect(todayDateString()).not.toBe(utcDate);
    }
  });
});

describe("rangeToDateBounds", () => {
  test("returns date strings for all presets", () => {
    for (const range of ["1M", "3M", "6M", "1Y"] as const) {
      const result = rangeToDateBounds(range);
      expect(result.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.from! < result.to).toBe(true);
    }
  });

  test("all returns null from", () => {
    const result = rangeToDateBounds("all");
    expect(result.from).toBeNull();
    expect(result.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("monthBounds", () => {
  test("returns first and last day of month", () => {
    const result = monthBounds("2026-02");
    expect(result.from).toBe("2026-02-01");
    expect(result.to).toBe("2026-02-28");
  });

  test("handles leap year", () => {
    const result = monthBounds("2024-02");
    expect(result.to).toBe("2024-02-29");
  });

  test("handles December", () => {
    const result = monthBounds("2026-12");
    expect(result.from).toBe("2026-12-01");
    expect(result.to).toBe("2026-12-31");
  });

  fcTest.prop([
    fc.integer({ min: 2020, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
  ])("last day is always a valid calendar date", (year, month) => {
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    const result = monthBounds(monthStr);
    const parsed = new Date(result.to + "T00:00:00");
    expect(parsed.getMonth() + 1).toBe(month);
  });
});

describe("shiftDateRange", () => {
  test("shifts preset 3M range by calendar months", () => {
    const result = shiftDateRange("2026-04-01", "2026-06-30", "back", true);
    expect(result.from).toBe("2026-01-01");
    expect(result.to).toBe("2026-03-31");
  });

  test("shifts custom range by exact day count", () => {
    const result = shiftDateRange("2026-03-10", "2026-03-20", "back", false);
    const fromDate = new Date(result.from + "T12:00:00");
    const toDate = new Date(result.to + "T12:00:00");
    const days = Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(days).toBe(10);
  });

  fcTest.prop([
    fc.integer({ min: 2020, max: 2028 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
    fc.integer({ min: 1, max: 365 }),
  ])("custom range shift preserves length", (year, month, day, daySpan) => {
    const from = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const fromDate = new Date(from + "T12:00:00");
    const toDate = new Date(fromDate);
    toDate.setDate(toDate.getDate() + daySpan);
    const to = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, "0")}-${String(toDate.getDate()).padStart(2, "0")}`;
    const result = shiftDateRange(from, to, "back", false);
    const originalDays = Math.round((new Date(to + "T12:00:00").getTime() - new Date(from + "T12:00:00").getTime()) / 86400000);
    const shiftedFrom = new Date(result.from + "T12:00:00");
    const shiftedTo = new Date(result.to + "T12:00:00");
    const shiftedDays = Math.round((shiftedTo.getTime() - shiftedFrom.getTime()) / 86400000);
    expect(shiftedDays).toBe(originalDays);
  });
});

describe("shiftDateRange on rolling preset ranges", () => {
  // rangeToDateBounds("3M") produces a *rolling* window (e.g. Jun 2 - Sep 2),
  // which spans four calendar months. The old month-span arithmetic added one
  // to that span and snapped to end-of-month, producing a 118-day baseline for
  // a 92-day window — so every comparison percentage was measured against a
  // window 28% longer than the one it described.
  const daysBetween = (a: string, b: string) =>
    Math.round((new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 86400000);

  test("a rolling 3M window shifts to the immediately preceding window of equal length", () => {
    const result = shiftDateRange("2026-06-02", "2026-09-02", "back", true);
    expect(result).toEqual({ from: "2026-03-02", to: "2026-06-02" });
  });

  test("the baseline is the same length as the window it compares against", () => {
    const result = shiftDateRange("2026-06-02", "2026-09-02", "back", true);
    expect(daysBetween(result.from, result.to)).toBe(daysBetween("2026-06-02", "2026-09-02"));
  });

  test("month-aligned presets still shift by whole calendar months", () => {
    // Apr 1 - Jun 30 is three whole months, so the baseline is Jan 1 - Mar 31
    // rather than an equal-day-count window landing mid-month.
    expect(shiftDateRange("2026-04-01", "2026-06-30", "back", true)).toEqual({
      from: "2026-01-01",
      to: "2026-03-31",
    });
  });

  test("forward shifts are symmetric with back shifts", () => {
    const back = shiftDateRange("2026-06-02", "2026-09-02", "back", true);
    expect(shiftDateRange(back.from, back.to, "forward", true)).toEqual({
      from: "2026-06-02",
      to: "2026-09-02",
    });
  });

  fcTest.prop([fc.integer({ min: 1, max: 200 })])(
    "a rolling preset baseline always matches the window length",
    (daySpan) => {
      const fromDate = new Date("2026-06-02T12:00:00");
      const toDate = new Date(fromDate);
      toDate.setDate(toDate.getDate() + daySpan);
      const to = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, "0")}-${String(toDate.getDate()).padStart(2, "0")}`;
      const result = shiftDateRange("2026-06-02", to, "back", true);
      expect(daysBetween(result.from, result.to)).toBe(daySpan);
    },
  );
});

describe("formatDateShort", () => {
  const thisYear = new Date().getFullYear();

  test("omits the year for dates in the current year", () => {
    expect(formatDateShort(`${thisYear}-03-05`)).toBe("Mar 5");
  });

  test("includes the year for dates outside it", () => {
    // A custom 2019 range used to render as "Jan 1 - Mar 31" with nothing
    // saying which year, and a year-over-year comparison label was
    // indistinguishable from the current year's.
    expect(formatDateShort(`${thisYear - 7}-01-01`)).toContain(String(thisYear - 7));
  });
});

describe("comparisonLabel", () => {
  test("formats date range as vs label", () => {
    const result = comparisonLabel("2026-01-01", "2026-03-31");
    expect(result).toMatch(/^vs /);
    expect(result).toContain("Jan");
    expect(result).toContain("Mar");
  });
});

describe("formatTxnSpan", () => {
  test("formats a span inside one year without repeating the year", () => {
    expect(formatTxnSpan("2026-02-11", "2026-05-11")).toBe("Feb 11 – May 11, 2026");
  });

  test("shows both years when the span crosses a year boundary", () => {
    expect(formatTxnSpan("2025-11-20", "2026-01-08")).toBe("Nov 20, 2025 – Jan 8, 2026");
  });

  test("collapses a single-day span to one date", () => {
    expect(formatTxnSpan("2026-03-04", "2026-03-04")).toBe("Mar 4, 2026");
  });
});
