import { describe, it, expect } from "vitest";
import { test, fc } from "@fast-check/vitest";
import {
  centsToDisplay,
  centsToCompact,
  displayToCents,
  plaidAmountToCents,
  normalizeAmount,
  parseToCents,
} from "./money";

describe("money utilities", () => {
  describe("centsToCompact", () => {
    it("abbreviates thousands and millions", () => {
      expect(centsToCompact(12830412)).toBe("$128.3K");
      expect(centsToCompact(123456789)).toBe("$1.2M");
    });
    it("drops the decimal when it is zero", () => {
      expect(centsToCompact(12000000)).toBe("$120K");
    });
    it("rounds sub-thousand amounts to whole dollars", () => {
      expect(centsToCompact(84012)).toBe("$840");
    });
    it("preserves the sign", () => {
      expect(centsToCompact(-12830412)).toBe("-$128.3K");
    });
  });

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
    it("flips sign for checking expense (positive → negative)", () => {
      expect(normalizeAmount(1250, "checking")).toBe(-1250);
    });
    it("flips sign for checking income (negative → positive)", () => {
      expect(normalizeAmount(-5000, "checking")).toBe(5000);
    });
    it("flips sign for credit card expense (positive → negative)", () => {
      expect(normalizeAmount(5000, "credit")).toBe(-5000);
    });
    it("flips sign for credit card payment (negative → positive)", () => {
      expect(normalizeAmount(-20000, "credit")).toBe(20000);
    });
    it("flips sign for investment accounts", () => {
      expect(normalizeAmount(100000, "investment")).toBe(-100000);
    });
    it("flips sign for depository accounts", () => {
      expect(normalizeAmount(1250, "depository")).toBe(-1250);
    });
    it("returns 0 (not -0) for zero amount on checking", () => {
      expect(Object.is(normalizeAmount(0, "checking"), -0)).toBe(false);
      expect(normalizeAmount(0, "checking")).toBe(0);
    });
    it("returns 0 (not -0) for zero amount on credit", () => {
      expect(Object.is(normalizeAmount(0, "credit"), -0)).toBe(false);
    });
    it("flips sign for other account types", () => {
      expect(normalizeAmount(1250, "other")).toBe(-1250);
    });
    it("flips sign for savings", () => {
      expect(normalizeAmount(1250, "savings")).toBe(-1250);
    });
    it("flips sign for loan", () => {
      expect(normalizeAmount(-5000, "loan")).toBe(5000);
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

describe("parseToCents", () => {
  it("parses a simple dollar string", () => {
    expect(parseToCents("125.00")).toBe(12500);
  });
  it("parses a string without decimals", () => {
    expect(parseToCents("125")).toBe(12500);
  });
  it("parses a string with $ prefix", () => {
    expect(parseToCents("$125.00")).toBe(12500);
  });
  it("parses a string with commas", () => {
    expect(parseToCents("$1,250.00")).toBe(125000);
  });
  it("returns null for invalid input", () => {
    expect(parseToCents("abc")).toBeNull();
  });
  it("returns null for empty string", () => {
    expect(parseToCents("")).toBeNull();
  });
  it("returns 0 for '0'", () => {
    expect(parseToCents("0")).toBe(0);
  });
  it("handles whitespace", () => {
    expect(parseToCents("  125.50  ")).toBe(12550);
  });
  it("parses European comma-decimal (no thousands separator)", () => {
    expect(parseToCents("1234,56")).toBe(123456);
  });
  it("parses European dot-thousands, comma-decimal", () => {
    expect(parseToCents("1.234,56")).toBe(123456);
  });
  it("parses accounting negatives in parentheses", () => {
    expect(parseToCents("(123.45)")).toBe(-12345);
  });
  it("parses a leading minus sign", () => {
    expect(parseToCents("-123.45")).toBe(-12345);
  });
  it("parses a leading plus sign", () => {
    expect(parseToCents("+123.45")).toBe(12345);
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
    "normalizeAmount flips sign for all account types",
    (amount) => {
      for (const type of ["checking", "savings", "credit", "loan", "investment", "other"]) {
        expect(normalizeAmount(amount, type)).toBe(amount === 0 ? 0 : -amount);
      }
    }
  );
  test.prop([fc.integer({ min: -9999999, max: 9999999 })])(
    "normalizeAmount sign symmetry for all account types",
    (amount) => {
      for (const type of ["checking", "credit", "loan"]) {
        const left = normalizeAmount(amount, type);
        const right = -normalizeAmount(-amount, type);
        expect(left).toBe(amount === 0 ? 0 : right);
      }
    }
  );
});
