import { describe, test, expect, vi, afterEach } from "vitest";
import { test as fcTest } from "@fast-check/vitest";
import { fc } from "@fast-check/vitest";
import { rangeToDateBounds, monthBounds, shiftDateRange, comparisonLabel, todayDateString } from "./date-utils";

describe("todayDateString", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("returns the local calendar date", () => {
    const now = new Date();
    const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(todayDateString()).toBe(local);
  });

  test("returns local-evening-previous-day, not the UTC date, west of UTC", () => {
    process.env.TZ = "America/Los_Angeles";
    vi.useFakeTimers();
    // 2026-01-01T02:00:00Z is still 2025-12-31 evening in America/Los_Angeles (UTC-8).
    vi.setSystemTime(new Date("2026-01-01T02:00:00Z"));
    expect(todayDateString()).toBe("2025-12-31");
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

describe("comparisonLabel", () => {
  test("formats date range as vs label", () => {
    const result = comparisonLabel("2026-01-01", "2026-03-31");
    expect(result).toMatch(/^vs /);
    expect(result).toContain("Jan");
    expect(result).toContain("Mar");
  });
});
