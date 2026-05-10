import { describe, it, expect } from "vitest";
import { test } from "@fast-check/vitest";
import { fc } from "@fast-check/vitest";
import { processHoldings, processInvestmentTransactions } from "./investments";
import type { PlaidHolding, PlaidSecurity, PlaidInvestmentTxn } from "./schemas";

const SECURITIES: PlaidSecurity[] = [
  {
    security_id: "sec-1",
    name: "Apple Inc",
    ticker_symbol: "AAPL",
    type: "equity",
    iso_currency_code: "USD",
    close_price: 150.0,
    sector: "Technology",
  },
  {
    security_id: "sec-2",
    name: "Vanguard S&P 500 ETF",
    ticker_symbol: "VOO",
    type: "etf",
    iso_currency_code: "USD",
    close_price: 400.0,
    sector: null,
  },
  {
    security_id: "sec-3",
    name: "Some Warrant",
    ticker_symbol: null,
    type: "warrant",
    iso_currency_code: "USD",
    close_price: 5.0,
  },
];

const ACCOUNT_MAP = new Map([
  ["plaid-acc-ira", "internal-acc-ira"],
  ["plaid-acc-401k", "internal-acc-401k"],
]);

describe("processHoldings", () => {
  it("maps security type correctly", () => {
    const holdings: PlaidHolding[] = [
      {
        account_id: "plaid-acc-ira",
        security_id: "sec-1",
        quantity: 10,
        institution_price: 150.0,
        institution_value: 1500.0,
        cost_basis: 1200.0,
        iso_currency_code: "USD",
      },
    ];
    const result = processHoldings(holdings, SECURITIES, "hh-1", ACCOUNT_MAP);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("stock");
    expect(result[0].ticker).toBe("AAPL");
    expect(result[0].securityName).toBe("Apple Inc");
    expect(result[0].sector).toBe("Technology");
  });

  it("converts values to integer cents", () => {
    const holdings: PlaidHolding[] = [
      {
        account_id: "plaid-acc-ira",
        security_id: "sec-1",
        quantity: 10,
        institution_price: 150.0,
        institution_value: 1500.0,
        cost_basis: 1200.5,
        iso_currency_code: "USD",
      },
    ];
    const result = processHoldings(holdings, SECURITIES, "hh-1", ACCOUNT_MAP);
    expect(result[0].currentValue).toBe(150000);
    expect(result[0].costBasis).toBe(120050);
  });

  it("preserves null cost basis", () => {
    const holdings: PlaidHolding[] = [
      {
        account_id: "plaid-acc-ira",
        security_id: "sec-1",
        quantity: 10,
        institution_price: 150.0,
        institution_value: 1500.0,
        cost_basis: null,
        iso_currency_code: "USD",
      },
    ];
    const result = processHoldings(holdings, SECURITIES, "hh-1", ACCOUNT_MAP);
    expect(result[0].costBasis).toBeNull();
  });

  it("skips holdings with unknown account_id", () => {
    const holdings: PlaidHolding[] = [
      {
        account_id: "plaid-acc-unknown",
        security_id: "sec-1",
        quantity: 10,
        institution_price: 150.0,
        institution_value: 1500.0,
        cost_basis: null,
        iso_currency_code: "USD",
      },
    ];
    const result = processHoldings(holdings, SECURITIES, "hh-1", ACCOUNT_MAP);
    expect(result).toHaveLength(0);
  });

  it("maps unknown security type to 'other'", () => {
    const holdings: PlaidHolding[] = [
      {
        account_id: "plaid-acc-ira",
        security_id: "sec-3",
        quantity: 100,
        institution_price: 5.0,
        institution_value: 500.0,
        cost_basis: 300.0,
        iso_currency_code: "USD",
      },
    ];
    const result = processHoldings(holdings, SECURITIES, "hh-1", ACCOUNT_MAP);
    expect(result[0].type).toBe("other");
  });

  it("skips holdings with missing security_id in lookup", () => {
    const holdings: PlaidHolding[] = [
      {
        account_id: "plaid-acc-ira",
        security_id: "sec-nonexistent",
        quantity: 10,
        institution_price: 100.0,
        institution_value: 1000.0,
        cost_basis: 500.0,
        iso_currency_code: "USD",
      },
    ];
    const result = processHoldings(holdings, SECURITIES, "hh-1", ACCOUNT_MAP);
    expect(result).toHaveLength(0);
  });
});

describe("processInvestmentTransactions", () => {
  it("converts amount/price/fees to cents", () => {
    const txns: PlaidInvestmentTxn[] = [
      {
        investment_transaction_id: "inv-txn-1",
        account_id: "plaid-acc-ira",
        security_id: "sec-1",
        date: "2026-05-01",
        name: "Buy AAPL",
        quantity: 5,
        amount: 750.0,
        price: 150.0,
        fees: 4.95,
        type: "buy",
        subtype: "buy",
        iso_currency_code: "USD",
      },
    ];
    const result = processInvestmentTransactions(txns, SECURITIES, ACCOUNT_MAP);
    expect(result[0].amount).toBe(75000);
    expect(result[0].price).toBe(15000);
    expect(result[0].fees).toBe(495);
  });

  it("preserves negative fees for rebates", () => {
    const txns: PlaidInvestmentTxn[] = [
      {
        investment_transaction_id: "inv-txn-2",
        account_id: "plaid-acc-ira",
        security_id: "sec-1",
        date: "2026-05-01",
        name: "Fee Rebate",
        quantity: 0,
        amount: 0,
        price: 0,
        fees: -5.0,
        type: "fee",
        subtype: null,
        iso_currency_code: "USD",
      },
    ];
    const result = processInvestmentTransactions(txns, SECURITIES, ACCOUNT_MAP);
    expect(result[0].fees).toBe(-500);
  });

  it("maps transaction type", () => {
    const txns: PlaidInvestmentTxn[] = [
      {
        investment_transaction_id: "inv-txn-3",
        account_id: "plaid-acc-ira",
        security_id: "sec-1",
        date: "2026-05-01",
        name: "Sell AAPL",
        quantity: -5,
        amount: -750.0,
        price: 150.0,
        fees: 0,
        type: "sell",
        subtype: "sell",
        iso_currency_code: "USD",
      },
    ];
    const result = processInvestmentTransactions(txns, SECURITIES, ACCOUNT_MAP);
    expect(result[0].type).toBe("sell");
  });
});

describe("processHoldings property tests", () => {
  test.prop([
    fc.float({ min: Math.fround(0), max: Math.fround(1_000_000), noNaN: true }),
    fc.float({ min: Math.fround(0.01), max: Math.fround(10_000), noNaN: true }),
  ])("converts arbitrary quantity/price without throwing", (quantity, price) => {
    const holdings: PlaidHolding[] = [
      {
        account_id: "plaid-acc-ira",
        security_id: "sec-1",
        quantity,
        institution_price: price,
        institution_value: quantity * price,
        cost_basis: quantity * price * 0.8,
        iso_currency_code: "USD",
      },
    ];
    const result = processHoldings(holdings, SECURITIES, "hh-1", ACCOUNT_MAP);
    expect(result).toHaveLength(1);
    expect(Number.isFinite(result[0].currentValue)).toBe(true);
    expect(Number.isFinite(result[0].costBasis!)).toBe(true);
  });
});

describe("processInvestmentTransactions property tests", () => {
  test.prop([
    fc.float({ min: Math.fround(-0.005), max: Math.fround(0.005), noNaN: true }),
    fc.float({ min: Math.fround(-0.005), max: Math.fround(0.005), noNaN: true }),
    fc.float({ min: Math.fround(-0.005), max: Math.fround(0.005), noNaN: true }),
  ])("never produces -0 for near-zero inputs", (amount, price, fees) => {
    const txns: PlaidInvestmentTxn[] = [
      {
        investment_transaction_id: "inv-txn-prop",
        account_id: "plaid-acc-ira",
        security_id: "sec-1",
        date: "2026-05-01",
        name: "Test",
        quantity: 0,
        amount,
        price,
        fees,
        type: "buy",
        subtype: null,
        iso_currency_code: "USD",
      },
    ];
    const result = processInvestmentTransactions(txns, SECURITIES, ACCOUNT_MAP);
    if (result.length > 0) {
      expect(Object.is(result[0].amount, -0)).toBe(false);
      expect(Object.is(result[0].price, -0)).toBe(false);
      expect(Object.is(result[0].fees, -0)).toBe(false);
    }
  });
});
