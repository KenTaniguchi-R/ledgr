import { describe, it, expect } from "vitest";
import { coverageBoundary, coveredTrendDelta } from "./net-worth-coverage";

function point(date: string, netWorth: number, covered: number, total: number) {
  return { date, netWorth, assets: 0, liabilities: 0, coveredAccounts: covered, totalAccounts: total };
}

describe("coverageBoundary", () => {
  it("finds where full coverage begins in a partially covered series", () => {
    const b = coverageBoundary([
      point("2026-06-01", -227156, 2, 10),
      point("2026-07-01", -37898, 4, 10),
      point("2026-08-28", 5294244, 10, 10),
      point("2026-08-29", 5294244, 10, 10),
    ]);

    expect(b.index).toBe(2);
    expect(b.date).toBe("2026-08-28");
    expect(b.hasPartial).toBe(true);
    expect(b.minCovered).toBe(2);
    expect(b.maxPartialCovered).toBe(4);
    expect(b.totalAccounts).toBe(10);
  });

  it("reports no partial span when every point is fully covered", () => {
    const b = coverageBoundary([
      point("2026-06-01", 100, 3, 3),
      point("2026-06-02", 200, 3, 3),
    ]);

    expect(b.index).toBe(0);
    expect(b.hasPartial).toBe(false);
    expect(b.minCovered).toBeNull();
  });

  it("reports no boundary when coverage is never complete", () => {
    const b = coverageBoundary([
      point("2026-06-01", 100, 1, 4),
      point("2026-06-02", 200, 2, 4),
    ]);

    expect(b.index).toBe(-1);
    expect(b.date).toBeNull();
    expect(b.hasPartial).toBe(true);
  });

  it("handles an empty series", () => {
    const b = coverageBoundary([]);
    expect(b.index).toBe(-1);
    expect(b.hasPartial).toBe(false);
    expect(b.totalAccounts).toBeNull();
  });

  it("treats a series with no coverage data as fully covered", () => {
    // Reports pass points without coverage fields; they must not be flagged.
    const b = coverageBoundary([
      { date: "2026-06-01", netWorth: 100 },
      { date: "2026-06-02", netWorth: 200 },
    ]);

    expect(b.hasPartial).toBe(false);
    expect(b.index).toBe(0);
  });
});

describe("coveredTrendDelta", () => {
  it("withholds a delta measured across a coverage boundary", () => {
    // The real bug: -$2,271 (2 of 10 accounts) → $52,942 (10 of 10) reported
    // as +2430.7%, which measures accounts appearing, not money arriving.
    const delta = coveredTrendDelta([
      point("2026-06-01", -227156, 2, 10),
      point("2026-08-28", 5294244, 10, 10),
    ]);

    expect(delta).toBeNull();
  });

  it("measures across the fully covered span only", () => {
    const delta = coveredTrendDelta([
      point("2026-06-01", -227156, 2, 10),
      point("2026-08-28", 5000000, 10, 10),
      point("2026-08-29", 5294244, 10, 10),
    ]);

    expect(delta).not.toBeNull();
    expect(delta!.diff).toBe(294244);
  });

  it("returns null when only one fully covered point exists", () => {
    expect(
      coveredTrendDelta([
        point("2026-06-01", -227156, 2, 10),
        point("2026-08-29", 5294244, 10, 10),
      ])
    ).toBeNull();
  });

  it("falls back to the whole series when no coverage data is present", () => {
    const delta = coveredTrendDelta([
      { date: "2026-06-01", netWorth: 100 },
      { date: "2026-06-02", netWorth: 150 },
    ]);

    expect(delta!.diff).toBe(50);
  });
});
