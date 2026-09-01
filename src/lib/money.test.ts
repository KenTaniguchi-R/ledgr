import { describe, it, expect } from "vitest";
import { test, fc } from "@fast-check/vitest";
import {
  centsToDisplay,
  centsToSignedDisplay,
  centsToCompact,
  displayToCents,
  plaidAmountToCents,
  simplefinAmountToCents,
  normalizeAmount,
  parseToCents,
  plaidBalanceToCents,
} from "./money";

describe("money utilities", () => {
  describe("centsToSignedDisplay", () => {
    it("writes both signs, so a delta never reads as a quantity", () => {
      expect(centsToSignedDisplay(1250)).toBe("+$12.50");
      expect(centsToSignedDisplay(-1250)).toBe("-$12.50");
    });

    it("treats zero as non-negative", () => {
      expect(centsToSignedDisplay(0)).toBe("+$0.00");
    });

    it("signs the amount, not the currency symbol", () => {
      expect(centsToSignedDisplay(-1250, "EUR")).toBe("-€12.50");
    });
  });

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
    // Normalization is account-type independent: Plaid uses one sign
    // convention across every account type, so a credit-card expense and a
    // checking expense normalize identically. That used to be asserted once
    // per account type; the function no longer takes a type at all, so the
    // cases below cover the three behaviours that actually differ.
    it("flips an expense positive → negative", () => {
      expect(normalizeAmount(1250)).toBe(-1250);
    });
    it("flips income negative → positive", () => {
      expect(normalizeAmount(-5000)).toBe(5000);
    });
    it("returns 0, not -0, for a zero amount", () => {
      // -0 breaks equality comparisons downstream; see the -0 gotcha in
      // CLAUDE.md.
      expect(normalizeAmount(0)).toBe(0);
      expect(Object.is(normalizeAmount(0), -0)).toBe(false);
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

  describe("simplefinAmountToCents", () => {
    it("converts a positive decimal string to integer cents", () => {
      expect(simplefinAmountToCents("100.23")).toBe(10023);
    });
    it("converts a negative decimal string to integer cents", () => {
      expect(simplefinAmountToCents("-33293.43")).toBe(-3329343);
    });
    it("returns 0 for a zero string", () => {
      expect(simplefinAmountToCents("0")).toBe(0);
    });
    it("returns null for a malformed string", () => {
      expect(simplefinAmountToCents("not-a-number")).toBeNull();
    });
    it("returns null for an empty string", () => {
      expect(simplefinAmountToCents("")).toBeNull();
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
    "normalizeAmount flips sign for any amount",
    (amount) => {
      expect(normalizeAmount(amount)).toBe(amount === 0 ? 0 : -amount);
    }
  );
  test.prop([fc.integer({ min: -9999999, max: 9999999 })])(
    "normalizeAmount is sign-symmetric",
    (amount) => {
      const left = normalizeAmount(amount);
      const right = -normalizeAmount(-amount);
      expect(left).toBe(amount === 0 ? 0 : right);
    }
  );

  describe("plaidBalanceToCents", () => {
    it("flips Plaid's positive-when-owed balance for liability accounts", () => {
      // Plaid: "For credit and loan accounts, a positive balance indicates
      // amount owed." Ledgr stores owed as negative.
      expect(plaidBalanceToCents(1048.93, "credit")).toBe(-104893);
      expect(plaidBalanceToCents(8200, "loan")).toBe(-820000);
    });

    it("leaves asset balances untouched", () => {
      expect(plaidBalanceToCents(1195.2, "checking")).toBe(119520);
      expect(plaidBalanceToCents(12500, "savings")).toBe(1250000);
      expect(plaidBalanceToCents(37351.62, "investment")).toBe(3735162);
    });

    it("keeps a lender-owes-you credit balance positive", () => {
      // Negative in Plaid means the lender owes the holder, which is an asset.
      expect(plaidBalanceToCents(-50, "credit")).toBe(5000);
    });

    it("never returns -0 for a zero liability balance", () => {
      expect(Object.is(plaidBalanceToCents(0, "credit"), 0)).toBe(true);
    });

    it("passes null through", () => {
      expect(plaidBalanceToCents(null, "credit")).toBeNull();
      expect(plaidBalanceToCents(undefined, "checking")).toBeNull();
    });

    test.prop([fc.integer({ min: -9999999, max: 9999999 })])(
      "net worth is the plain sum of normalized balances",
      (cents) => {
        const dollars = cents / 100;
        const asset = plaidBalanceToCents(dollars, "checking")!;
        const liability = plaidBalanceToCents(dollars, "credit")!;
        expect(asset + liability).toBe(0);
      }
    );
  });
});
