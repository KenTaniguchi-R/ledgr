import { describe, test, expect } from "vitest";
import { formatNetWorthHistory } from "./dashboard";
import type { NetWorthPoint } from "@/queries/dashboard";

describe("formatNetWorthHistory", () => {
  test("maps each point to cents plus display values for assets, liabilities, and net worth", () => {
    const points: NetWorthPoint[] = [
      { date: "2026-06-01", assets: 1_000_00, liabilities: 250_00, netWorth: 750_00 },
    ];

    expect(formatNetWorthHistory(points)).toEqual([
      {
        date: "2026-06-01",
        assetsCents: 100_000,
        assetsDisplay: "$1,000.00",
        liabilitiesCents: 25_000,
        liabilitiesDisplay: "$250.00",
        netWorthCents: 75_000,
        netWorthDisplay: "$750.00",
      },
    ]);
  });

  test("preserves order and handles negative net worth", () => {
    const points: NetWorthPoint[] = [
      { date: "2026-05-01", assets: 100_00, liabilities: 400_00, netWorth: -300_00 },
      { date: "2026-06-01", assets: 500_00, liabilities: 100_00, netWorth: 400_00 },
    ];

    const result = formatNetWorthHistory(points);

    expect(result.map((p) => p.date)).toEqual(["2026-05-01", "2026-06-01"]);
    expect(result[0].netWorthCents).toBe(-30_000);
    expect(result[0].netWorthDisplay).toBe("-$300.00");
  });

  test("returns an empty array for no points", () => {
    expect(formatNetWorthHistory([])).toEqual([]);
  });
});
