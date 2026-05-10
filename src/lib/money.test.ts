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

  describe("normalizeAmount", () => {
    it("flips sign for checking accounts (expense positive → negative)", () => {
      expect(normalizeAmount(1250, "checking")).toBe(-1250);
    });
    it("flips sign for checking accounts (income negative → positive)", () => {
      expect(normalizeAmount(-5000, "checking")).toBe(5000);
    });
    it("preserves sign for credit accounts", () => {
      expect(normalizeAmount(-5000, "credit")).toBe(-5000);
    });
    it("preserves sign for credit account payments (positive stays positive)", () => {
      expect(normalizeAmount(20000, "credit")).toBe(20000);
    });
    it("preserves sign for investment accounts", () => {
      expect(normalizeAmount(-100000, "investment")).toBe(-100000);
    });
    it("does not flip sign for raw plaid 'depository' type (dead code guard)", () => {
      expect(normalizeAmount(1250, "depository")).toBe(1250);
    });
    it("returns 0 (not -0) for zero amount on checking", () => {
      expect(Object.is(normalizeAmount(0, "checking"), -0)).toBe(false);
      expect(normalizeAmount(0, "checking")).toBe(0);
    });
    it("returns 0 (not -0) for zero amount on credit", () => {
      expect(Object.is(normalizeAmount(0, "credit"), -0)).toBe(false);
    });
    it("treats unknown account types as no-flip (safe default)", () => {
      expect(normalizeAmount(1250, "other")).toBe(-1250);
    });
    it("treats savings as flip", () => {
      expect(normalizeAmount(1250, "savings")).toBe(-1250);
    });
    it("treats checking as flip", () => {
      expect(normalizeAmount(1250, "checking")).toBe(-1250);
    });
    it("treats loan as credit-like (no flip)", () => {
      expect(normalizeAmount(-5000, "loan")).toBe(-5000);
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
});

describe("money property-based tests", () => {
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

  test.prop([fc.integer({ min: -9999999, max: 9999999 })])(
    "normalizeAmount sign symmetry for checking",
    (amount) => {
      expect(normalizeAmount(amount, "checking")).toBe(
        -normalizeAmount(-amount, "checking")
      );
    }
  );
  test.prop([fc.integer({ min: -9999999, max: 9999999 })])(
    "normalizeAmount is identity for credit accounts",
    (amount) => {
      expect(normalizeAmount(amount, "credit")).toBe(amount === 0 ? 0 : amount);
    }
  );
});
