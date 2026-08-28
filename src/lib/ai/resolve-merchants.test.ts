import { describe, test, expect } from "vitest";
import { buildMerchantResolutionPrompt, validateIdentifications, isPlausibleDomain } from "./resolve-merchants";

describe("buildMerchantResolutionPrompt", () => {
  test("includes transaction ids and descriptions", () => {
    const prompt = buildMerchantResolutionPrompt([
      { id: "txn-1", description: "FedEx" },
    ]);
    expect(prompt).toContain("txn-1");
    expect(prompt).toContain("FedEx");
  });

  test("instructs conservative behavior for non-merchant descriptions", () => {
    const prompt = buildMerchantResolutionPrompt([{ id: "txn-1", description: "Transfer" }]);
    expect(prompt).toMatch(/internal transfers/i);
    expect(prompt).toMatch(/conservative/i);
  });
});

describe("validateIdentifications", () => {
  const batchTransactionIds = new Set(["txn-1", "txn-2"]);

  test("accepts identifications for known transaction ids", () => {
    const result = validateIdentifications(
      [{ transactionId: "txn-1", merchantName: "FedEx", merchantDomain: "fedex.com" }],
      batchTransactionIds,
    );
    expect(result).toHaveLength(1);
  });

  test("rejects a hallucinated transaction id", () => {
    const result = validateIdentifications(
      [{ transactionId: "txn-99", merchantName: "FedEx", merchantDomain: "fedex.com" }],
      batchTransactionIds,
    );
    expect(result).toHaveLength(0);
  });
});

describe("isPlausibleDomain", () => {
  test("accepts well-formed hostnames", () => {
    expect(isPlausibleDomain("fedex.com")).toBe(true);
    expect(isPlausibleDomain("sub.example.co.uk")).toBe(true);
  });

  test("rejects garbage that isn't a hostname", () => {
    expect(isPlausibleDomain("not a domain!!")).toBe(false);
    expect(isPlausibleDomain("")).toBe(false);
    expect(isPlausibleDomain("http://fedex.com")).toBe(false);
  });
});
