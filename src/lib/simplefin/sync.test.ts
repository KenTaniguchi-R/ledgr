import { describe, it, expect } from "vitest";
import { processBatch } from "./sync";
import type { SimplefinAccount, SimplefinTransaction } from "./schemas";

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
    extra: null,
    org: { domain: "mybank.com", "sfin-url": "https://sfin.mybank.com", name: "My Bank", url: null, id: null },
    conn_id: null,
    conn_name: null,
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
