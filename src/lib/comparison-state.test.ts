import { describe, test, expect } from "vitest";
import { comparisonState } from "./comparison-state";

describe("comparisonState", () => {
  test("a category absent from the baseline is new, not unchanged", () => {
    // Both used to render as an empty cell, so "we have never seen this before"
    // and "it did not move" looked identical in the Change column.
    expect(comparisonState(5_000, null)).toEqual({ kind: "new" });
  });

  test("a baseline of zero is also new — there was nothing to grow from", () => {
    expect(comparisonState(5_000, 0)).toEqual({ kind: "new" });
  });

  test("spending that went up", () => {
    expect(comparisonState(150_00, 100_00)).toEqual({ kind: "up", percent: 50 });
  });

  test("spending that came down", () => {
    expect(comparisonState(50_00, 100_00)).toEqual({ kind: "down", percent: -50 });
  });

  test("a move under half a percent reads as flat", () => {
    expect(comparisonState(100_30, 100_00)).toEqual({ kind: "flat", percent: 0.3 });
    expect(comparisonState(100_00, 100_00)).toEqual({ kind: "flat", percent: 0 });
  });

  test("half a percent is a move, not flat", () => {
    expect(comparisonState(100_50, 100_00).kind).toBe("up");
  });

  test("a category that spent nothing this period against a real baseline", () => {
    expect(comparisonState(0, 100_00)).toEqual({ kind: "down", percent: -100 });
  });
});
