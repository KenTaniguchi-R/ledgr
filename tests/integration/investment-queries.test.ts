import { describe, it, expect, beforeEach } from "vitest";
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
} from "@/queries/investments";
import type { LedgrDb } from "@/db";

describe("investment queries", () => {
  let db: LedgrDb;
  let householdId: string;
  let accountId: string;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    const hh = insertHousehold(db);
    householdId = hh.householdId;
    const acc = insertAccount(db, householdId, { type: "investment" });
    accountId = acc.accountId;
  });

  describe("getPortfolioSummary", () => {
    it("returns totals from holdings", () => {
      insertInvestmentHolding(db, accountId, { currentValue: 150000, costBasis: 120000 });
      insertInvestmentHolding(db, accountId, { currentValue: 200000, costBasis: 180000, ticker: "VOO", plaidSecurityId: "sec-2" });

      const summary = getPortfolioSummary(householdId, db);
      expect(summary.totalValue).toBe(350000);
      expect(summary.totalCostBasis).toBe(300000);
      expect(summary.totalGainLoss).toBe(50000);
    });

    it("returns dayChange from holdings_history", () => {
      insertHoldingsSnapshot(db, accountId, "2026-05-09", { value: 140000, plaidSecurityId: "sec-1" });
      insertHoldingsSnapshot(db, accountId, "2026-05-10", { value: 150000, plaidSecurityId: "sec-1" });

      const summary = getPortfolioSummary(householdId, db, "2026-05-10");
      expect(summary.dayChange).toBe(10000);
    });

    it("returns null dayChange with only one date", () => {
      insertHoldingsSnapshot(db, accountId, "2026-05-10", { value: 150000 });

      const summary = getPortfolioSummary(householdId, db, "2026-05-10");
      expect(summary.dayChange).toBeNull();
    });
  });

  describe("getAssetAllocation", () => {
    it("groups by type", () => {
      insertInvestmentHolding(db, accountId, { type: "stock", currentValue: 100000, plaidSecurityId: "sec-1" });
      insertInvestmentHolding(db, accountId, { type: "etf", currentValue: 200000, plaidSecurityId: "sec-2" });

      const allocation = getAssetAllocation(householdId, db);
      expect(allocation).toHaveLength(2);
      const stockSlice = allocation.find((a) => a.type === "stock");
      expect(stockSlice?.value).toBe(100000);
      expect(Math.round(stockSlice!.percentage)).toBe(33);
    });
  });

  describe("getHoldings", () => {
    it("consolidated view merges by ticker", () => {
      const acc2 = insertAccount(db, householdId, { type: "investment", name: "401k" });
      insertInvestmentHolding(db, accountId, { ticker: "AAPL", currentValue: 100000, quantity: 10, plaidSecurityId: "sec-1" });
      insertInvestmentHolding(db, acc2.accountId, { ticker: "AAPL", currentValue: 150000, quantity: 15, plaidSecurityId: "sec-1" });

      const holdings = getHoldings(householdId, "consolidated", undefined, db);
      const aapl = holdings.find((h) => h.ticker === "AAPL");
      expect(aapl?.currentValue).toBe(250000);
      expect(aapl?.quantity).toBe(25);
    });

    it("by-account view returns separate rows", () => {
      const acc2 = insertAccount(db, householdId, { type: "investment", name: "401k" });
      insertInvestmentHolding(db, accountId, { ticker: "AAPL", currentValue: 100000, plaidSecurityId: "sec-1" });
      insertInvestmentHolding(db, acc2.accountId, { ticker: "AAPL", currentValue: 150000, plaidSecurityId: "sec-1" });

      const holdings = getHoldings(householdId, "by-account", undefined, db);
      expect(holdings).toHaveLength(2);
    });
  });

  describe("getPortfolioHistory", () => {
    it("aggregates by date", () => {
      insertHoldingsSnapshot(db, accountId, "2026-05-08", { value: 100000, plaidSecurityId: "sec-1" });
      insertHoldingsSnapshot(db, accountId, "2026-05-08", { value: 200000, plaidSecurityId: "sec-2" });
      insertHoldingsSnapshot(db, accountId, "2026-05-09", { value: 120000, plaidSecurityId: "sec-1" });

      const history = getPortfolioHistory(householdId, { dateFrom: "2026-05-01", dateTo: "2026-05-10" }, db);
      expect(history).toHaveLength(2);
      const day8 = history.find((h) => h.date === "2026-05-08");
      expect(day8?.value).toBe(300000);
    });
  });

  describe("getInvestmentTransactions", () => {
    it("filters by type and paginates", () => {
      insertInvestmentTransaction(db, accountId, { type: "buy", date: "2026-05-01", amount: 75000, plaidInvestmentTransactionId: "t1" });
      insertInvestmentTransaction(db, accountId, { type: "sell", date: "2026-05-02", amount: -80000, plaidInvestmentTransactionId: "t2" });
      insertInvestmentTransaction(db, accountId, { type: "buy", date: "2026-05-03", amount: 60000, plaidInvestmentTransactionId: "t3" });

      const page = getInvestmentTransactions(householdId, { type: "buy" }, 10, null, db);
      expect(page.rows).toHaveLength(2);
      expect(page.rows.every((r) => r.type === "buy")).toBe(true);
    });
  });
});
