import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertPlaidItem,
  insertInvestmentHolding,
  insertHoldingsSnapshot,
} from "./helpers";
import { applyInvestmentsToDb, snapshotHoldings } from "@/lib/plaid/investments";
import type { HoldingRow, InvestmentTxnRow } from "@/lib/plaid/investments";
import { investmentHoldings, holdingsHistory, investmentTransactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { LedgrDb } from "@/db";

function makeHolding(accountId: string, overrides: Partial<HoldingRow> = {}): HoldingRow {
  return {
    id: crypto.randomUUID(),
    accountId,
    plaidSecurityId: "sec-1",
    securityName: "Apple Inc",
    ticker: "AAPL",
    quantity: 10,
    costBasis: 120000,
    currentValue: 150000,
    type: "stock",
    sector: "Technology",
    currency: "USD",
    asOfDate: "2026-05-10",
    ...overrides,
  };
}

function makeTxn(accountId: string, overrides: Partial<InvestmentTxnRow> = {}): InvestmentTxnRow {
  return {
    id: crypto.randomUUID(),
    accountId,
    plaidInvestmentTransactionId: `inv-txn-${crypto.randomUUID().slice(0, 8)}`,
    securityName: "Apple Inc",
    ticker: "AAPL",
    type: "buy",
    quantity: 5,
    price: 15000,
    amount: 75000,
    fees: 495,
    date: "2026-05-01",
    ...overrides,
  };
}

describe("applyInvestmentsToDb", () => {
  let db: LedgrDb;
  let closeDb: () => void;
  let householdId: string;
  let accountId: string;
  let plaidItemId: string;

  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_KEY", "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2");
    const result = createTestDb();
    db = result.db;
    closeDb = result.close;
    const hh = insertHousehold(db);
    householdId = hh.householdId;
    const pi = insertPlaidItem(db, householdId);
    plaidItemId = pi.plaidItemId;
    const acc = insertAccount(db, householdId, {
      type: "investment",
      plaidAccountId: "plaid-acc-ira",
      plaidItemId,
    });
    accountId = acc.accountId;
  });

  afterEach(() => {
    closeDb?.();
    vi.unstubAllEnvs();
  });

  it("inserts holdings and transactions", () => {
    const holdings = [makeHolding(accountId)];
    const txns = [makeTxn(accountId)];

    const result = applyInvestmentsToDb(db, holdings, txns, plaidItemId, householdId);

    expect(result.holdingsUpserted).toBe(1);
    expect(result.txnsInserted).toBe(1);

    const dbHoldings = db.select().from(investmentHoldings).all();
    expect(dbHoldings).toHaveLength(1);
    expect(dbHoldings[0].currentValue).toBe(150000);

    const dbTxns = db.select().from(investmentTransactions).all();
    expect(dbTxns).toHaveLength(1);
    expect(dbTxns[0].amount).toBe(75000);
  });

  it("full-replaces holdings on re-sync", () => {
    const h1 = [makeHolding(accountId, { currentValue: 100000 })];
    applyInvestmentsToDb(db, h1, [], plaidItemId, householdId);

    const h2 = [makeHolding(accountId, { currentValue: 200000 })];
    applyInvestmentsToDb(db, h2, [], plaidItemId, householdId);

    const dbHoldings = db.select().from(investmentHoldings).all();
    expect(dbHoldings).toHaveLength(1);
    expect(dbHoldings[0].currentValue).toBe(200000);
  });

  it("deduplicates transactions with INSERT OR IGNORE", () => {
    const txn = makeTxn(accountId, { plaidInvestmentTransactionId: "dup-txn" });
    applyInvestmentsToDb(db, [], [txn], plaidItemId, householdId);
    applyInvestmentsToDb(db, [], [{ ...txn, id: crypto.randomUUID() }], plaidItemId, householdId);

    const dbTxns = db.select().from(investmentTransactions).all();
    expect(dbTxns).toHaveLength(1);
  });

  it("writes holdings_history snapshot", () => {
    const holdings = [makeHolding(accountId)];
    applyInvestmentsToDb(db, holdings, [], plaidItemId, householdId);

    const snapshots = db.select().from(holdingsHistory).all();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].value).toBe(150000);
  });

  it("prevents duplicate snapshots via unique constraint", () => {
    const holdings = [makeHolding(accountId)];
    applyInvestmentsToDb(db, holdings, [], plaidItemId, householdId);
    applyInvestmentsToDb(db, holdings, [], plaidItemId, householdId);

    const snapshots = db.select().from(holdingsHistory).all();
    expect(snapshots).toHaveLength(1);
  });

  it("isolates holdings across households", () => {
    const hh2 = insertHousehold(db, "Other Household");
    const acc2 = insertAccount(db, hh2.householdId, { type: "investment" });

    applyInvestmentsToDb(db, [makeHolding(accountId)], [], plaidItemId, householdId);
    insertInvestmentHolding(db, acc2.accountId, { currentValue: 999999 });

    const hh1Holdings = db
      .select()
      .from(investmentHoldings)
      .where(eq(investmentHoldings.accountId, accountId))
      .all();
    expect(hh1Holdings).toHaveLength(1);
    expect(hh1Holdings[0].currentValue).toBe(150000);
  });
});

describe("snapshotHoldings", () => {
  it("idempotently snapshots holdings", () => {
    const { db, close } = createTestDb();
    const { householdId } = insertHousehold(db);
    const { accountId } = insertAccount(db, householdId, { type: "investment" });
    insertInvestmentHolding(db, accountId, {
      plaidSecurityId: "sec-1",
      currentValue: 150000,
    });

    snapshotHoldings(db);
    snapshotHoldings(db);

    const snapshots = db.select().from(holdingsHistory).all();
    expect(snapshots).toHaveLength(1);
    close();
  });
});
