import { describe, it, expect } from "vitest";
import { rangeSupport, RANGES } from "./net-worth-range";

const asOf = new Date("2026-08-29T12:00:00Z");

describe("rangeSupport", () => {
  describe("when every account has been covered from the start", () => {
    it("supports every range", () => {
      const support = rangeSupport(null, asOf);
      expect(support.every((r) => r.supported)).toBe(true);
    });

    it("recommends the widest range, since all of it is honest", () => {
      expect(rangeSupport(null, asOf).find((r) => r.recommended)?.range).toBe("All");
    });
  });

  describe("when coverage begins partway through", () => {
    // Coverage from 2026-06-01: 1M (from 07-29) is inside it, 3M (from 05-29)
    // reaches back before it. Called inside each test rather than at describe
    // scope — a describe-time call happens during collection, which Stryker's
    // per-test coverage cannot attribute to any test, so mutants here looked
    // survived when the assertions did cover them.
    const partway = () => rangeSupport("2026-06-01", asOf);

    it("supports ranges that start after coverage began", () => {
      const byRange = Object.fromEntries(partway().map((r) => [r.range, r]));
      expect(byRange["1M"].supported).toBe(true);
    });

    it("does not support ranges reaching back before coverage began", () => {
      const byRange = Object.fromEntries(partway().map((r) => [r.range, r]));
      expect(byRange["3M"].supported).toBe(false);
      expect(byRange["6M"].supported).toBe(false);
      expect(byRange["1Y"].supported).toBe(false);
      expect(byRange["All"].supported).toBe(false);
    });

    it("recommends the widest supported range", () => {
      // Not the narrowest: the reader should see as much honest history as
      // there is, just not more than there is.
      expect(partway().find((r) => r.recommended)?.range).toBe("1M");
    });

    it("recommends exactly one range", () => {
      expect(partway().filter((r) => r.recommended)).toHaveLength(1);
    });
  });

  describe("when coverage began too recently for any standard range", () => {
    // This is the case that produced a 6M chart that was 95% hatching.
    const tooRecent = () => rangeSupport("2026-08-28", asOf);

    it("supports no standard range", () => {
      expect(tooRecent().some((r) => r.supported)).toBe(false);
    });

    it("recommends nothing, so the caller falls back to the covered span", () => {
      expect(tooRecent().some((r) => r.recommended)).toBe(false);
    });
  });

  it("treats coverage starting exactly on the range boundary as supported", () => {
    // Midnight asOf so the window start lands exactly on the coverage date:
    // 1M back from 2026-08-29T00:00Z is 2026-07-29T00:00Z. With a non-midnight
    // asOf the two timestamps differ by hours and the boundary is never
    // actually exercised — the comparison could be > or >= and both pass.
    const midnight = new Date("2026-08-29T00:00:00Z");
    const support = rangeSupport("2026-07-29", midnight);
    expect(support.find((r) => r.range === "1M")?.supported).toBe(true);
  });

  it("does not support a range that starts one day before coverage", () => {
    const midnight = new Date("2026-08-29T00:00:00Z");
    const support = rangeSupport("2026-07-30", midnight);
    expect(support.find((r) => r.range === "1M")?.supported).toBe(false);
  });

  it("returns the ranges in display order", () => {
    expect(rangeSupport(null, asOf).map((r) => r.range)).toEqual([...RANGES]);
  });

  it("explains why an unsupported range is unavailable", () => {
    const support = rangeSupport("2026-08-28", asOf);
    const reason = support.find((r) => r.range === "6M")?.reason;
    // The control should say what is missing rather than just going grey.
    expect(reason).toMatch(/Aug 28/);
  });

  it("gives supported ranges no reason text", () => {
    expect(rangeSupport(null, asOf).every((r) => r.reason === null)).toBe(true);
  });
});
