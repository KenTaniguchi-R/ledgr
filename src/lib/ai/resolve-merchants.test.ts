import { describe, test, expect } from "vitest";
import {
  buildMerchantResolutionPrompt,
  validateIdentifications,
  isPlausibleDomain,
  merchantNameKey,
  buildMerchantNameIndex,
} from "./resolve-merchants";

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

describe("merchantNameKey", () => {
  test("collapses per-charge reference suffixes onto one key", () => {
    expect(merchantNameKey("Cloudflare Cloudflare St-t9v3j2d5z7d6")).toBe(
      merchantNameKey("Cloudflare Cloudflare St-y0e6w1x6a6x3"),
    );
    expect(merchantNameKey("LAWSON 1234")).toBe("lawson");
  });

  test("keeps a name made only of digit-bearing tokens", () => {
    expect(merchantNameKey("7-Eleven")).toBe("7-eleven");
  });

  test("keeps distinct merchants distinct", () => {
    expect(merchantNameKey("Paypal *twilio")).not.toBe(merchantNameKey("Paypal Purchase Fwdemail"));
  });
});

describe("buildMerchantNameIndex", () => {
  test("maps a merchant's name and every raw spelling to it", () => {
    const index = buildMerchantNameIndex([
      { id: "m-amazon", name: "Amazon Japan", rawNames: JSON.stringify(["Amazon.Co.Jp"]) },
    ]);
    expect(index.get(merchantNameKey("Amazon.Co.Jp"))).toBe("m-amazon");
    expect(index.get(merchantNameKey("Amazon Japan"))).toBe("m-amazon");
  });

  test("marks a spelling two merchants share as ambiguous", () => {
    const index = buildMerchantNameIndex([
      { id: "m-1", name: "Shell", rawNames: JSON.stringify(["Shell Oil 123"]) },
      { id: "m-2", name: "Shell Oil", rawNames: null },
    ]);
    expect(index.get("shell oil")).toBeNull();
    expect(index.get("shell")).toBe("m-1");
  });
});
