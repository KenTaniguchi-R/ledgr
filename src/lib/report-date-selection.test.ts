import { describe, test, expect } from "vitest";
import { resolveReportDateSelection, DEFAULT_REPORT_PRESET } from "./report-date-selection";

/**
 * The Reports page and its filter bar both have to answer "which range is
 * selected?". They used to answer separately, and disagreed: the bar labelled a
 * bare /reports "Last 3 months" while the page treated it as all-time and
 * silently dropped the comparison column.
 */
describe("resolveReportDateSelection", () => {
  test("a bare /reports is the 3M default, not all time", () => {
    const s = resolveReportDateSelection({});
    expect(s.effectivePreset).toBe(DEFAULT_REPORT_PRESET);
    expect(s.isAllTime).toBe(false);
    expect(s.isPreset).toBe(true);
  });

  test("?preset=3M resolves identically to the bare default", () => {
    expect(resolveReportDateSelection({ preset: "3M" })).toEqual(
      resolveReportDateSelection({}),
    );
  });

  test("only an explicit all-time preset is all time", () => {
    const s = resolveReportDateSelection({ preset: "all" });
    expect(s.isAllTime).toBe(true);
  });

  test("a custom from/to range is neither a preset nor all time", () => {
    const s = resolveReportDateSelection({ from: "2019-01-01", to: "2019-03-31" });
    expect(s.effectivePreset).toBeNull();
    expect(s.isPreset).toBe(false);
    expect(s.isAllTime).toBe(false);
  });

  test("a preset wins over from/to, which the filter bar sets alongside it", () => {
    const s = resolveReportDateSelection({ from: "2026-06-02", to: "2026-09-02", preset: "6M" });
    expect(s.effectivePreset).toBe("6M");
    expect(s.isPreset).toBe(true);
  });

  test("a half-specified custom range falls back to the default", () => {
    expect(resolveReportDateSelection({ from: "2026-06-02" }).effectivePreset).toBe(DEFAULT_REPORT_PRESET);
    expect(resolveReportDateSelection({ to: "2026-09-02" }).effectivePreset).toBe(DEFAULT_REPORT_PRESET);
  });
});
