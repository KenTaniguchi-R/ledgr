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
  let closeDb: () => Promise<void>;
  let householdId: string;
  let accountId: string;
  let plaidItemId: string;

  beforeEach(async () => {
    vi.stubEnv("ENCRYPTION_KEY", "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2");
    ({ db, close: closeDb } = await createTestDb());
    const hh = await insertHousehold(db);
    householdId = hh.householdId;
    const pi = await insertPlaidItem(db, householdId);
    plaidItemId = pi.plaidItemId;
    const acc = await insertAccount(db, householdId, {
      type: "investment",
      plaidAccountId: "plaid-acc-ira",
      plaidItemId,
    });
    accountId = acc.accountId;
  });

  afterEach(async () => {
    await closeDb?.();
    vi.unstubAllEnvs();
  });

  it("inserts holdings and transactions", async () => {
    const holdings = [makeHolding(accountId)];
    const txns = [makeTxn(accountId)];

    const result = await applyInvestmentsToDb(db, holdings, txns, plaidItemId);

    expect(result.holdingsUpserted).toBe(1);
    expect(result.txnsInserted).toBe(1);

    const dbHoldings = await db.select().from(investmentHoldings);
    expect(dbHoldings).toHaveLength(1);
    expect(dbHoldings[0].currentValue).toBe(150000);

    const dbTxns = await db.select().from(investmentTransactions);
    expect(dbTxns).toHaveLength(1);
    expect(dbTxns[0].amount).toBe(75000);
  });

  it("full-replaces holdings on re-sync", async () => {
    const h1 = [makeHolding(accountId, { currentValue: 100000 })];
    await applyInvestmentsToDb(db, h1, [], plaidItemId);

    const h2 = [makeHolding(accountId, { currentValue: 200000 })];
    await applyInvestmentsToDb(db, h2, [], plaidItemId);

    const dbHoldings = await db.select().from(investmentHoldings);
    expect(dbHoldings).toHaveLength(1);
    expect(dbHoldings[0].currentValue).toBe(200000);
  });

  it("deduplicates transactions with INSERT OR IGNORE", async () => {
    const txn = makeTxn(accountId, { plaidInvestmentTransactionId: "dup-txn" });
    await applyInvestmentsToDb(db, [], [txn], plaidItemId);
    await applyInvestmentsToDb(db, [], [{ ...txn, id: crypto.randomUUID() }], plaidItemId);

    const dbTxns = await db.select().from(investmentTransactions);
    expect(dbTxns).toHaveLength(1);
  });

  it("writes holdings_history snapshot", async () => {
    const holdings = [makeHolding(accountId)];
    await applyInvestmentsToDb(db, holdings, [], plaidItemId);

    const snapshots = await db.select().from(holdingsHistory);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].value).toBe(150000);
  });

  it("prevents duplicate snapshots via unique constraint", async () => {
    const holdings = [makeHolding(accountId)];
    await applyInvestmentsToDb(db, holdings, [], plaidItemId);
    await applyInvestmentsToDb(db, holdings, [], plaidItemId);

    const snapshots = await db.select().from(holdingsHistory);
    expect(snapshots).toHaveLength(1);
  });

  it("isolates holdings across households", async () => {
    const hh2 = await insertHousehold(db, "Other Household");
    const acc2 = await insertAccount(db, hh2.householdId, { type: "investment" });

    await applyInvestmentsToDb(db, [makeHolding(accountId)], [], plaidItemId);
    await insertInvestmentHolding(db, acc2.accountId, { currentValue: 999999 });

    const hh1Holdings = await db
      .select()
      .from(investmentHoldings)
      .where(eq(investmentHoldings.accountId, accountId));
    expect(hh1Holdings).toHaveLength(1);
    expect(hh1Holdings[0].currentValue).toBe(150000);
  });
});

describe("snapshotHoldings", () => {
  it("idempotently snapshots holdings", async () => {
    const { db, close } = await createTestDb();
    const { householdId } = await insertHousehold(db);
    const { accountId } = await insertAccount(db, householdId, { type: "investment" });
    await insertInvestmentHolding(db, accountId, {
      plaidSecurityId: "sec-1",
      currentValue: 150000,
    });

    await snapshotHoldings(db);
    await snapshotHoldings(db);

    const snapshots = await db.select().from(holdingsHistory);
    expect(snapshots).toHaveLength(1);
    await close();
  });
});
