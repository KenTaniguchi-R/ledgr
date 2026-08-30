import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertInvestmentHolding,
  insertHoldingsSnapshot,
  insertInvestmentTransaction,
} from "./helpers";
import {
  getPortfolioSummary,
  getAssetAllocation,
  getHoldings,
  getPortfolioHistory,
  getInvestmentTransactions,
  getAccountReconciliation,
} from "@/queries/investments";
import type { LedgrDb } from "@/db";

describe("investment queries", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;
  let householdId: string;
  let accountId: string;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    const hh = await insertHousehold(db);
    householdId = hh.householdId;
    const acc = await insertAccount(db, householdId, { type: "investment" });
    accountId = acc.accountId;
  });

  afterEach(async () => {
    await close();
  });

  describe("getPortfolioSummary", () => {
    it("returns totals from holdings when the account carries no balance", async () => {
      await insertInvestmentHolding(db, accountId, { currentValue: 150000, costBasis: 120000 });
      await insertInvestmentHolding(db, accountId, { currentValue: 200000, costBasis: 180000, ticker: "VOO", plaidSecurityId: "sec-2" });

      const summary = await getPortfolioSummary(householdId, db);
      expect(summary.totalValue).toBe(350000);
      expect(summary.holdingsValue).toBe(350000);
      expect(summary.cashValue).toBe(0);
      expect(summary.totalCostBasis).toBe(300000);
      expect(summary.totalGainLoss).toBe(50000);
    });

    it("takes the total from the account balance, not the holdings sum", async () => {
      // The reported bug: an account reporting $14,274.92 with only $1,219.86
      // of itemized holdings silently lost the difference.
      const acc = await insertAccount(db, householdId, { type: "investment", currentBalance: 1427492 });
      await insertInvestmentHolding(db, acc.accountId, { currentValue: 121986, costBasis: 100000 });

      const summary = await getPortfolioSummary(householdId, db, undefined, [acc.accountId]);

      expect(summary.totalValue).toBe(1427492);
      expect(summary.holdingsValue).toBe(121986);
      expect(summary.cashValue).toBe(1305506);
    });

    it("reports no cash when holdings account for the whole balance", async () => {
      const acc = await insertAccount(db, householdId, { type: "investment", currentBalance: 7697 });
      await insertInvestmentHolding(db, acc.accountId, { currentValue: 7697, costBasis: 5000 });

      const summary = await getPortfolioSummary(householdId, db, undefined, [acc.accountId]);

      expect(summary.cashValue).toBe(0);
      expect(summary.totalValue).toBe(7697);
    });

    it("never reports negative cash when holdings exceed a stale balance", async () => {
      const acc = await insertAccount(db, householdId, { type: "investment", currentBalance: 1000 });
      await insertInvestmentHolding(db, acc.accountId, { currentValue: 5000, costBasis: 4000 });

      const summary = await getPortfolioSummary(householdId, db, undefined, [acc.accountId]);

      expect(summary.cashValue).toBe(0);
    });

    it("excludes holdings with no cost basis from gain/loss", async () => {
      // Second bug in the same figure: totalValue counted every holding but
      // totalCostBasis skipped null-basis ones, so their whole value read as
      // gain. ETH and BTC carry no basis, which inflated the reported total.
      const acc = await insertAccount(db, householdId, { type: "investment", currentBalance: 300000 });
      await insertInvestmentHolding(db, acc.accountId, { currentValue: 100000, costBasis: 80000 });
      await insertInvestmentHolding(db, acc.accountId, {
        currentValue: 200000,
        costBasis: null,
        ticker: "ETH",
        plaidSecurityId: "sec-eth",
      });

      const summary = await getPortfolioSummary(householdId, db, undefined, [acc.accountId]);

      // Gain covers only the holding that has a basis: 100000 - 80000.
      expect(summary.totalGainLoss).toBe(20000);
      expect(summary.totalCostBasis).toBe(80000);
      // ...and it says how much of the portfolio that figure describes.
      expect(summary.gainLossCoverage).toBe(100000);
      // The null-basis holding still counts toward what the portfolio is worth.
      expect(summary.holdingsValue).toBe(300000);
    });
  });

  describe("getAccountReconciliation", () => {
    it("reports the gap between each account's balance and its holdings", async () => {
      const acc = await insertAccount(db, householdId, {
        type: "investment",
        name: "Robinhood IRA",
        currentBalance: 1427492,
      });
      await insertInvestmentHolding(db, acc.accountId, { currentValue: 121986, costBasis: 100000 });

      const rows = await getAccountReconciliation(householdId, db);
      const row = rows.find((r) => r.accountId === acc.accountId)!;

      expect(row.accountName).toBe("Robinhood IRA");
      expect(row.balance).toBe(1427492);
      expect(row.holdingsValue).toBe(121986);
      expect(row.cashValue).toBe(1305506);
      expect(row.hasHoldings).toBe(true);
    });

    it("flags an account that reports a balance but no holdings at all", async () => {
      const acc = await insertAccount(db, householdId, {
        type: "investment",
        name: "Unitemized",
        currentBalance: 500000,
      });

      const rows = await getAccountReconciliation(householdId, db);
      const row = rows.find((r) => r.accountId === acc.accountId)!;

      expect(row.hasHoldings).toBe(false);
      expect(row.holdingsValue).toBe(0);
      expect(row.cashValue).toBe(500000);
    });

    it("does not return another household's investment accounts", async () => {
      const theirs = await insertHousehold(db);
      await insertAccount(db, theirs.householdId, { type: "investment", currentBalance: 999999 });

      const rows = await getAccountReconciliation(householdId, db);

      expect(rows.every((r) => r.balance !== 999999)).toBe(true);
    });
  });

  describe("getPortfolioSummary day change", () => {
    it("returns dayChange from holdings_history", async () => {
      await insertHoldingsSnapshot(db, accountId, "2026-05-09", { value: 140000, plaidSecurityId: "sec-1" });
      await insertHoldingsSnapshot(db, accountId, "2026-05-10", { value: 150000, plaidSecurityId: "sec-1" });

      const summary = await getPortfolioSummary(householdId, db, "2026-05-10");
      expect(summary.dayChange).toBe(10000);
    });

    it("returns null dayChange with only one date", async () => {
      await insertHoldingsSnapshot(db, accountId, "2026-05-10", { value: 150000 });

      const summary = await getPortfolioSummary(householdId, db, "2026-05-10");
      expect(summary.dayChange).toBeNull();
    });
  });

  describe("getAssetAllocation", () => {
    it("groups by type", async () => {
      await insertInvestmentHolding(db, accountId, { type: "stock", currentValue: 100000, plaidSecurityId: "sec-1" });
      await insertInvestmentHolding(db, accountId, { type: "etf", currentValue: 200000, plaidSecurityId: "sec-2" });

      const allocation = await getAssetAllocation(householdId, db);
      expect(allocation).toHaveLength(2);
      const stockSlice = allocation.find((a) => a.type === "stock");
      expect(stockSlice?.value).toBe(100000);
      expect(Math.round(stockSlice!.percentage)).toBe(33);
    });
  });

  describe("getHoldings", () => {
    it("consolidated view merges by ticker", async () => {
      const acc2 = await insertAccount(db, householdId, { type: "investment", name: "401k" });
      await insertInvestmentHolding(db, accountId, { ticker: "AAPL", currentValue: 100000, quantity: 10, plaidSecurityId: "sec-1" });
      await insertInvestmentHolding(db, acc2.accountId, { ticker: "AAPL", currentValue: 150000, quantity: 15, plaidSecurityId: "sec-1" });

      const holdings = await getHoldings(householdId, "consolidated", undefined, db);
      const aapl = holdings.find((h) => h.ticker === "AAPL");
      expect(aapl?.currentValue).toBe(250000);
      expect(aapl?.quantity).toBe(25);
    });

    it("by-account view returns separate rows", async () => {
      const acc2 = await insertAccount(db, householdId, { type: "investment", name: "401k" });
      await insertInvestmentHolding(db, accountId, { ticker: "AAPL", currentValue: 100000, plaidSecurityId: "sec-1" });
      await insertInvestmentHolding(db, acc2.accountId, { ticker: "AAPL", currentValue: 150000, plaidSecurityId: "sec-1" });

      const holdings = await getHoldings(householdId, "by-account", undefined, db);
      expect(holdings).toHaveLength(2);
    });
  });

  describe("getPortfolioHistory", () => {
    it("aggregates by date", async () => {
      await insertHoldingsSnapshot(db, accountId, "2026-05-08", { value: 100000, plaidSecurityId: "sec-1" });
      await insertHoldingsSnapshot(db, accountId, "2026-05-08", { value: 200000, plaidSecurityId: "sec-2" });
      await insertHoldingsSnapshot(db, accountId, "2026-05-09", { value: 120000, plaidSecurityId: "sec-1" });

      const history = await getPortfolioHistory(householdId, { dateFrom: "2026-05-01", dateTo: "2026-05-10" }, db);
      expect(history).toHaveLength(2);
      const day8 = history.find((h) => h.date === "2026-05-08");
      expect(day8?.value).toBe(300000);
    });
  });

  describe("getInvestmentTransactions", () => {
    it("filters by type and paginates", async () => {
      await insertInvestmentTransaction(db, accountId, { type: "buy", date: "2026-05-01", amount: 75000, plaidInvestmentTransactionId: "t1" });
      await insertInvestmentTransaction(db, accountId, { type: "sell", date: "2026-05-02", amount: -80000, plaidInvestmentTransactionId: "t2" });
      await insertInvestmentTransaction(db, accountId, { type: "buy", date: "2026-05-03", amount: 60000, plaidInvestmentTransactionId: "t3" });

      const page = await getInvestmentTransactions(householdId, { type: "buy" }, 10, null, db);
      expect(page.rows).toHaveLength(2);
      expect(page.rows.every((r) => r.type === "buy")).toBe(true);
    });
  });
});
