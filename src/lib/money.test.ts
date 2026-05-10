import { describe, it, expect } from "vitest";
import { test, fc } from "@fast-check/vitest";
import {
  centsToDisplay,
  displayToCents,
  plaidAmountToCents,
  normalizeAmount,
} from "./money";

describe("money utilities", () => {
  describe("centsToDisplay", () => {
    it("formats positive cents as USD", () => {
      expect(centsToDisplay(1250)).toBe("$12.50");
    });
    it("formats zero", () => {
      expect(centsToDisplay(0)).toBe("$0.00");
    });
    it("formats negative cents", () => {
      expect(centsToDisplay(-1250)).toBe("-$12.50");
    });
    it("formats large amounts with comma separators", () => {
      expect(centsToDisplay(1000000)).toBe("$10,000.00");
    });
  });

  describe("displayToCents", () => {
    it("converts dollars to cents", () => {
      expect(displayToCents(12.5)).toBe(1250);
    });
    it("handles zero", () => {
      expect(displayToCents(0)).toBe(0);
    });
    it("rounds fractional cents", () => {
      expect(displayToCents(12.555)).toBe(1256);
    });
  });

  describe("plaidAmountToCents", () => {
    it("converts Plaid dollar amount to integer cents", () => {
      expect(plaidAmountToCents(12.5)).toBe(1250);
    });
    it("handles negative amounts (credits)", () => {
      expect(plaidAmountToCents(-50.0)).toBe(-5000);
    });
    it("returns null for null input", () => {
      expect(plaidAmountToCents(null)).toBeNull();
    });
    it("returns null for undefined input", () => {
      expect(plaidAmountToCents(undefined as unknown as number | null)).toBeNull();
    });
    it("returns 0 for zero (not null)", () => {
      expect(plaidAmountToCents(0)).toBe(0);
    });
  });

  describe("normalizeAmount", () => {
    it("flips positive to negative (expense)", () => {
      expect(normalizeAmount(1250)).toBe(-1250);
    });
    it("flips negative to positive (income)", () => {
      expect(normalizeAmount(-1250)).toBe(1250);
    });
    it("handles zero", () => {
      expect(Math.abs(normalizeAmount(0))).toBe(0);
    });
  });
});

describe("money property-based tests", () => {
  test.prop([fc.integer({ min: -100_000_000, max: 100_000_000 })])(
    "normalizeAmount is its own inverse",
    (amount) => {
      expect(normalizeAmount(normalizeAmount(amount))).toBe(amount);
    }
  );

  test.prop([fc.double({ min: -999999.99, max: 999999.99, noNaN: true, noDefaultInfinity: true })])(
    "plaidAmountToCents always returns an integer",
    (amount) => {
      expect(Number.isInteger(plaidAmountToCents(amount))).toBe(true);
    }
  );

  test.prop([fc.double({ min: -999999.99, max: 999999.99, noNaN: true, noDefaultInfinity: true })])(
    "displayToCents always returns an integer",
    (amount) => {
      expect(Number.isInteger(displayToCents(amount))).toBe(true);
    }
  );

  test.prop([fc.integer({ min: 1, max: 100_000_000 })])(
    "normalizeAmount of positive is negative (sign convention)",
    (amount) => {
      expect(normalizeAmount(amount)).toBeLessThan(0);
    }
  );

  test.prop([fc.integer({ min: -100_000_000, max: -1 })])(
    "normalizeAmount of negative is positive (sign convention)",
    (amount) => {
      expect(normalizeAmount(amount)).toBeGreaterThan(0);
    }
  );
});
