import { describe, it, expect } from "vitest";
import { processBatch } from "./sync";
import type { PlaidTransaction } from "./schemas";

// Helper to create test transactions
function makeTxn(overrides: Partial<PlaidTransaction> = {}): PlaidTransaction {
  return {
    transaction_id: "txn-1",
    account_id: "acc-checking",
    amount: 12.5,
    iso_currency_code: "USD",
    date: "2026-05-01",
    name: "TEST PURCHASE",
    merchant_name: "Test Store",
    logo_url: null,
    pending: false,
    pending_transaction_id: null,
    personal_finance_category: null,
    ...overrides,
  };
}

const accountTypeMap = new Map([
  ["acc-checking", "checking"],
  ["acc-credit", "credit"],
  ["acc-investment", "investment"],
]);

describe("processBatch", () => {
  it("converts Plaid float amounts to integer cents", () => {
    const result = processBatch(
      [makeTxn({ amount: 12.5 })],
      [],
      [],
      "hh-1",
      accountTypeMap,
    );

    expect(result.inserts[0].amount).toBe(1250);
  });

  it("normalizes amount for depository (flips sign)", () => {
    const result = processBatch(
      [makeTxn({ account_id: "acc-checking", amount: 12.5 })],
      [],
      [],
      "hh-1",
      accountTypeMap,
    );

    // checking is depository-type → sign flips: 1250 → -1250
    expect(result.inserts[0].normalizedAmount).toBe(-1250);
  });

  it("normalizes amount for credit (flips sign)", () => {
    const result = processBatch(
      [makeTxn({ account_id: "acc-credit", amount: 12.5 })],
      [],
      [],
      "hh-1",
      accountTypeMap,
    );

    // credit → sign flipped: 1250 → -1250 (expense)
    expect(result.inserts[0].normalizedAmount).toBe(-1250);
  });

  it("builds merchant upsert payload with title-cased name", () => {
    const result = processBatch(
      [makeTxn({ merchant_name: "WHOLE FOODS MARKET" })],
      [],
      [],
      "hh-1",
      accountTypeMap,
    );

    expect(result.merchantUpserts).toHaveLength(1);
    expect(result.merchantUpserts[0].normalizedName).toBe(
      "Whole Foods Market",
    );
    expect(result.merchantUpserts[0].rawNames).toEqual(["WHOLE FOODS MARKET"]);
  });

  it("skips merchant for transactions without merchant_name", () => {
    const result = processBatch(
      [makeTxn({ merchant_name: null })],
      [],
      [],
      "hh-1",
      accountTypeMap,
    );

    expect(result.merchantUpserts).toHaveLength(0);
  });

  it("detects pending-to-posted transitions", () => {
    const result = processBatch(
      [
        makeTxn({
          transaction_id: "txn-posted",
          pending_transaction_id: "txn-pending-old",
          pending: false,
        }),
      ],
      [],
      [],
      "hh-1",
      accountTypeMap,
    );

    expect(result.pendingToRemove).toContain("txn-pending-old");
  });

  it("puts modified transactions in upserts", () => {
    const modified = makeTxn({
      transaction_id: "txn-mod-1",
      amount: 25.0,
      name: "UPDATED NAME",
    });

    const result = processBatch([], [modified], [], "hh-1", accountTypeMap);

    expect(result.inserts).toHaveLength(0);
    expect(result.upserts).toHaveLength(1);
    expect(result.upserts[0].plaidTransactionId).toBe("txn-mod-1");
    expect(result.upserts[0].amount).toBe(2500);
  });

  it("deduplicates merchant upserts by normalized name", () => {
    const result = processBatch(
      [
        makeTxn({
          transaction_id: "txn-1",
          merchant_name: "AMAZON",
        }),
        makeTxn({
          transaction_id: "txn-2",
          merchant_name: "amazon",
        }),
        makeTxn({
          transaction_id: "txn-3",
          merchant_name: "Amazon",
        }),
      ],
      [],
      [],
      "hh-1",
      accountTypeMap,
    );

    expect(result.merchantUpserts).toHaveLength(1);
    expect(result.merchantUpserts[0].normalizedName).toBe("Amazon");
    // All three raw names should be collected
    expect(result.merchantUpserts[0].rawNames).toEqual(
      expect.arrayContaining(["AMAZON", "amazon", "Amazon"]),
    );
  });
});
