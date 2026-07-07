import { describe, test, expect } from "vitest";
import {
  mapSecurityType,
  SECURITY_TYPE_MAP,
  PlaidTransactionSchema,
  PlaidSyncResponseSchema,
} from "./schemas";

describe("mapSecurityType", () => {
  test("maps every known Plaid security type", () => {
    for (const [plaidType, expected] of Object.entries(SECURITY_TYPE_MAP)) {
      expect(mapSecurityType(plaidType)).toBe(expected);
    }
  });

  test("is case-insensitive", () => {
    expect(mapSecurityType("EQUITY")).toBe("stock");
    expect(mapSecurityType("Mutual Fund")).toBe("mutual_fund");
  });

  test("null or unknown types fall back to other", () => {
    expect(mapSecurityType(null)).toBe("other");
    expect(mapSecurityType("derivative")).toBe("other");
  });
});

describe("PlaidTransactionSchema", () => {
  test("accepts a minimal valid transaction (optional fields omitted)", () => {
    const parsed = PlaidTransactionSchema.parse({
      transaction_id: "t1",
      account_id: "a1",
      amount: 12.5,
      iso_currency_code: "USD",
      date: "2026-07-07",
      name: "Coffee",
      pending: false,
    });
    expect(parsed.transaction_id).toBe("t1");
    expect(parsed.merchant_name).toBeUndefined();
  });

  test("rejects when a required field is missing or mistyped", () => {
    expect(() =>
      PlaidTransactionSchema.parse({
        transaction_id: "t1",
        account_id: "a1",
        amount: "not-a-number",
        iso_currency_code: null,
        date: "2026-07-07",
        name: "Coffee",
        pending: false,
      }),
    ).toThrow();
  });
});

describe("PlaidSyncResponseSchema", () => {
  test("parses a sync response with empty change sets", () => {
    const parsed = PlaidSyncResponseSchema.parse({
      added: [],
      modified: [],
      removed: [],
      has_more: false,
      next_cursor: "cursor_abc",
    });
    expect(parsed.has_more).toBe(false);
    expect(parsed.next_cursor).toBe("cursor_abc");
  });
});
