import { describe, it, expect } from "vitest";
import { test } from "@fast-check/vitest";
import * as fc from "fast-check";
import { classifySingleLegTransfer } from "./transfer-patterns";

describe("classifySingleLegTransfer", () => {
  it("recognizes a known card-issuer payoff memo as high confidence", () => {
    expect(classifySingleLegTransfer("Applecard Gsbank Payment Xxxxx4415", "Apple")).toBe("pattern");
  });

  it("recognizes a generic credit card payment memo as high confidence", () => {
    expect(classifySingleLegTransfer("ONLINE CREDIT CARD PAYMENT - THANK YOU", null)).toBe("pattern");
  });

  it("recognizes a named self-transfer to savings as high confidence", () => {
    expect(classifySingleLegTransfer("Apple GS Savings Transfer", "Apple")).toBe("pattern");
  });

  it("recognizes a named self-transfer to a brokerage as high confidence", () => {
    expect(classifySingleLegTransfer("Transfer to Brokerage Account", null)).toBe("pattern");
  });

  it("does not flag an unrelated merchant charge that merely contains the word transfer", () => {
    expect(classifySingleLegTransfer("Wire Transfer Fee - City Bank", null)).toBeNull();
  });

  it("recognizes a bare Zelle transaction name as a suggested (low-confidence) transfer", () => {
    expect(classifySingleLegTransfer("Zelle", null)).toBe("suggested");
  });

  it("recognizes a bare Venmo merchant name as suggested", () => {
    expect(classifySingleLegTransfer("Venmo Payment", "Venmo")).toBe("suggested");
  });

  it("recognizes Cash App and PayPal as suggested", () => {
    expect(classifySingleLegTransfer("Cash App", null)).toBe("suggested");
    expect(classifySingleLegTransfer("Paypal Transfer", "PayPal")).toBe("suggested");
  });

  it("does not flag an ordinary merchant purchase", () => {
    expect(classifySingleLegTransfer("Uber", "Uber")).toBeNull();
    expect(classifySingleLegTransfer("Amazon.com*5Q2MG7LQ2", "Amazon")).toBeNull();
  });

  it("does not flag a person's name with no processor or transfer keyword", () => {
    // Genuinely ambiguous P2P payments with no lexical hook (e.g. a bank's own
    // "sender name" memo) are out of scope for text matching — they still need
    // a human to notice via the existing manual isTransfer toggle.
    expect(classifySingleLegTransfer("Bahar Rabiei", null)).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(classifySingleLegTransfer("gsbank payment", null)).toBe("pattern");
    expect(classifySingleLegTransfer("ZELLE", null)).toBe("suggested");
  });

  test.prop([fc.string()])("never throws on arbitrary input", (name) => {
    expect(() => classifySingleLegTransfer(name, null)).not.toThrow();
  });
});
