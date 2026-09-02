import { describe, test, expect } from "vitest";
import { netWorthChange, MIN_BASE_FOR_PERCENT } from "./net-worth-change";

const pt = (netWorth: number) => ({ netWorth });

describe("netWorthChange", () => {
  test("reports the current value and the movement across the range", () => {
    const r = netWorthChange([pt(1_000_00), pt(1_200_00), pt(1_500_00)]);
    expect(r.current).toBe(1_500_00);
    expect(r.change).toBe(500_00);
  });

  test("a percentage off a meaningful base is kept", () => {
    const r = netWorthChange([pt(1_000_00), pt(1_500_00)]);
    expect(r.percent).toBeCloseTo(50, 5);
  });

  test("a percentage off a near-zero base is suppressed", () => {
    // The reported case: an opening balance of $5.15 turned a $534 gain into
    // "+10381.3%" — a number about the opening balance, not about the year.
    const r = netWorthChange([pt(515), pt(539_79)]);
    expect(r.change).toBe(534_64);
    // 534.64 / 5.15 is the +10381.3% the tile actually printed.
    expect(r.change / 515 * 100).toBeCloseTo(10381.4, 0);
    expect(r.percent).toBeNull();
  });

  test("the cutoff is the base's magnitude, so a negative opening still qualifies", () => {
    const r = netWorthChange([pt(-1_000_00), pt(-500_00)]);
    expect(r.percent).toBeCloseTo(50, 5);
  });

  test("a base exactly at the cutoff still reports a percentage", () => {
    const r = netWorthChange([pt(MIN_BASE_FOR_PERCENT), pt(MIN_BASE_FOR_PERCENT * 2)]);
    expect(r.percent).toBeCloseTo(100, 5);
  });

  test("a base one cent under the cutoff does not", () => {
    expect(netWorthChange([pt(MIN_BASE_FOR_PERCENT - 1), pt(50_000_00)]).percent).toBeNull();
  });

  test("an opening balance of exactly zero cannot yield a ratio", () => {
    expect(netWorthChange([pt(0), pt(1_000_00)]).percent).toBeNull();
  });

  test("a single point has nothing to compare against", () => {
    const r = netWorthChange([pt(1_000_00)]);
    expect(r.current).toBe(1_000_00);
    expect(r.change).toBe(0);
    expect(r.percent).toBeNull();
  });

  test("no points at all", () => {
    expect(netWorthChange([])).toEqual({ current: 0, change: 0, percent: null });
  });
});
