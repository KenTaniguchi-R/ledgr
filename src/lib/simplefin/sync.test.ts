import { describe, it, expect } from "vitest";
import { processBatch, processHoldings } from "./sync";
import type { SimplefinAccount, SimplefinTransaction, SimplefinHolding } from "./schemas";

function makeTxn(overrides: Partial<SimplefinTransaction> = {}): SimplefinTransaction {
  return {
    id: "txn-1",
    posted: 1735689600, // 2025-01-01T00:00:00Z
    amount: "-12.50",
    description: "TEST PURCHASE",
    transacted_at: null,
    pending: false,
    extra: null,
    ...overrides,
  };
}

function makeAccount(overrides: Partial<SimplefinAccount> = {}): SimplefinAccount {
  return {
    id: "acc-checking",
    name: "Checking",
    currency: "USD",
    balance: "1000.00",
    "available-balance": "1000.00",
    "balance-date": 1735689600,
    transactions: [],
    holdings: [],
    extra: null,
    org: { domain: "mybank.com", "sfin-url": "https://sfin.mybank.com", name: "My Bank", url: null, id: null },
    conn_id: null,
    conn_name: null,
    ...overrides,
  };
}

function makeHolding(overrides: Partial<SimplefinHolding> = {}): SimplefinHolding {
  return {
    id: "HOL-1",
    symbol: "NVDA",
    description: "NVIDIA Corp",
    shares: "0.102313",
    market_value: "22.38915379",
    cost_basis: "0.00",
    purchase_price: "54.929",
    currency: "USD",
    created: 1787938315,
    ...overrides,
  };
}

describe("processBatch", () => {
  it("converts SimpleFIN decimal-string amounts to integer cents", () => {
    const result = processBatch([makeAccount({ transactions: [makeTxn({ amount: "-12.50" })] })]);
    expect(result.rows[0].amount).toBe(-1250);
  });

  it("does not flip sign — SimpleFIN's convention already matches normalizedAmount", () => {
    const result = processBatch([makeAccount({ transactions: [makeTxn({ amount: "-12.50" })] })]);
    expect(result.rows[0].normalizedAmount).toBe(result.rows[0].amount);
    expect(result.rows[0].normalizedAmount).toBe(-1250);

    const income = processBatch([makeAccount({ transactions: [makeTxn({ amount: "500.00" })] })]);
    expect(income.rows[0].normalizedAmount).toBe(50000);
  });

  it("tags each transaction with its owning account's id", () => {
    const result = processBatch([
      makeAccount({ id: "acc-a", transactions: [makeTxn({ id: "t1" })] }),
      makeAccount({ id: "acc-b", transactions: [makeTxn({ id: "t2" })] }),
    ]);
    expect(result.rows.find((r) => r.externalId === "t1")?.externalAccountId).toBe("acc-a");
    expect(result.rows.find((r) => r.externalId === "t2")?.externalAccountId).toBe("acc-b");
  });

  it("converts a unix epoch posted timestamp to a YYYY-MM-DD date", () => {
    const result = processBatch([
      makeAccount({ transactions: [makeTxn({ posted: 1735689600 })] }),
    ]);
    expect(result.rows[0].date).toBe("2025-01-01");
  });

  it("prefers transacted_at over posted for the date when both are present", () => {
    const result = processBatch([
      makeAccount({
        transactions: [makeTxn({ posted: 1735689600, transacted_at: 1735776000 })], // +1 day
      }),
    ]);
    expect(result.rows[0].date).toBe("2025-01-02");
  });

  it("marks a transaction pending when posted is 0, even without an explicit pending flag", () => {
    const result = processBatch([
      makeAccount({ transactions: [makeTxn({ posted: 0, pending: null })] }),
    ]);
    expect(result.rows[0].pending).toBe(true);
  });

  it("skips a transaction with a malformed amount string", () => {
    const result = processBatch([
      makeAccount({ transactions: [makeTxn({ amount: "not-a-number" })] }),
    ]);
    expect(result.rows).toHaveLength(0);
  });

  it("uses the account's currency for every one of its transactions", () => {
    const result = processBatch([
      makeAccount({ currency: "EUR", transactions: [makeTxn()] }),
    ]);
    expect(result.rows[0].currency).toBe("EUR");
  });

  it("cleans the description into a display name while preserving the original", () => {
    const result = processBatch([
      makeAccount({ transactions: [makeTxn({ description: "ACH ELECTRONIC DEBIT AMAZON.COM" })] }),
    ]);
    expect(result.rows[0].originalName).toBe("ACH ELECTRONIC DEBIT AMAZON.COM");
    expect(result.rows[0].name).not.toBe("");
  });

  it("returns no rows for an account with no transactions", () => {
    const result = processBatch([makeAccount({ transactions: null })]);
    expect(result.rows).toHaveLength(0);
  });

  it("flattens transactions across multiple accounts into one row list", () => {
    const result = processBatch([
      makeAccount({ id: "acc-a", transactions: [makeTxn({ id: "t1" }), makeTxn({ id: "t2" })] }),
      makeAccount({ id: "acc-b", transactions: [makeTxn({ id: "t3" })] }),
    ]);
    expect(result.rows).toHaveLength(3);
  });
});

describe("processHoldings", () => {
  it("converts decimal-string market_value to integer cents", () => {
    const result = processHoldings([makeAccount({ holdings: [makeHolding({ market_value: "22.38915379" })] })]);
    expect(result[0].currentValue).toBe(2239); // rounds to nearest cent
  });

  it("parses shares as a plain float quantity, not cents", () => {
    const result = processHoldings([makeAccount({ holdings: [makeHolding({ shares: "0.102313" })] })]);
    expect(result[0].quantity).toBeCloseTo(0.102313);
  });

  it("falls back to purchase_price × shares when cost_basis is reported as zero", () => {
    const result = processHoldings([
      makeAccount({ holdings: [makeHolding({ cost_basis: "0.00", purchase_price: "54.929", shares: "0.102313" })] }),
    ]);
    expect(result[0].costBasis).toBe(Math.round(5492.9 * 0.102313));
  });

  it("uses a genuinely nonzero cost_basis as-is, without falling back", () => {
    const result = processHoldings([
      makeAccount({ holdings: [makeHolding({ cost_basis: "500.00", purchase_price: "999.00" })] }),
    ]);
    expect(result[0].costBasis).toBe(50000);
  });

  it("classifies a known crypto ticker as type crypto", () => {
    const result = processHoldings([
      makeAccount({ holdings: [makeHolding({ symbol: "BTC", description: "Bitcoin Crypto Currency" })] }),
    ]);
    expect(result[0].type).toBe("crypto");
  });

  it("classifies a known ETF ticker as type etf", () => {
    const result = processHoldings([makeAccount({ holdings: [makeHolding({ symbol: "VOO" })] })]);
    expect(result[0].type).toBe("etf");
  });

  it("classifies a known bond ETF ticker as type bond", () => {
    const result = processHoldings([makeAccount({ holdings: [makeHolding({ symbol: "BND" })] })]);
    expect(result[0].type).toBe("bond");
  });

  it("falls back to type stock for an unrecognized ticker", () => {
    const result = processHoldings([makeAccount({ holdings: [makeHolding({ symbol: "NVDA" })] })]);
    expect(result[0].type).toBe("stock");
  });

  it("classifies a SimpleFIN currency symbol as cash, not stock", () => {
    const result = processHoldings([makeAccount({ holdings: [makeHolding({ symbol: "CUR:USD" })] })]);
    expect(result[0].type).toBe("cash");
  });

  it("classifies a money-market sweep fund as cash, not stock", () => {
    const result = processHoldings([makeAccount({ holdings: [makeHolding({ symbol: "SPAXX" })] })]);
    expect(result[0].type).toBe("cash");
  });

  it("falls back to type other when there's no ticker at all", () => {
    const result = processHoldings([makeAccount({ holdings: [makeHolding({ symbol: null })] })]);
    expect(result[0].type).toBe("other");
  });

  it("skips a holding with no shares and no market value", () => {
    const result = processHoldings([
      makeAccount({ holdings: [makeHolding({ shares: "0", market_value: "0.00" })] }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("tags each holding with its owning account's id", () => {
    const result = processHoldings([
      makeAccount({ id: "acc-a", holdings: [makeHolding({ id: "HOL-a" })] }),
      makeAccount({ id: "acc-b", holdings: [makeHolding({ id: "HOL-b" })] }),
    ]);
    expect(result.find((r) => r.securityId.includes("NVDA"))?.externalAccountId).toBeDefined();
    expect(result.every((r) => ["acc-a", "acc-b"].includes(r.externalAccountId))).toBe(true);
  });

  it("returns no rows for an account with no holdings", () => {
    const result = processHoldings([makeAccount({ holdings: null })]);
    expect(result).toHaveLength(0);
  });
});
