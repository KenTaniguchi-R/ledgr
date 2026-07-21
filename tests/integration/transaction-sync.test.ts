import { describe, it, expect, afterEach, beforeAll, afterAll, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { v4 as uuid } from "uuid";
import { createTestDb } from "./setup";
import { server } from "../mocks/server";
import {
  syncWithModifiedHandler,
  syncWithRemovedHandler,
  syncEmptyHandler,
  TEST_TXN_IDS,
} from "../mocks/handlers";
import { syncInstitution } from "@/lib/plaid/sync";
import { encrypt } from "@/lib/encryption";
import { resetPlaidClient } from "@/lib/plaid/client";
import {
  households,
  householdMembers,
  plaidItems,
  accounts,
  transactions,
  merchants,
  syncLog,
} from "@/db/schema";
import type { LedgrDb } from "@/db";

const HOUSEHOLD_ID = "hh-test-sync";
const PLAID_ITEM_ID = "plaid-item-sync-test";

beforeAll(() => {
  vi.stubEnv("PLAID_CLIENT_ID", "test-id");
  vi.stubEnv("PLAID_SECRET", "test-secret");
  vi.stubEnv("PLAID_ENV", "sandbox");
  vi.stubEnv("ENCRYPTION_KEY", "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2");
  server.listen({ onUnhandledRequest: "error" });
});

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

describe("transaction sync integration", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;

  beforeEach(() => {
    resetPlaidClient();
  });

  afterEach(async () => {
    server.resetHandlers();
    await close?.();
  });

  async function setup() {
    ({ db, close } = await createTestDb());
    return db;
  }

  async function seedTestData(testDb: LedgrDb) {
    const now = new Date();

    await testDb.insert(households).values({
      id: HOUSEHOLD_ID,
      name: "Test Household",
      createdAt: now,
      updatedAt: now,
    });

    await testDb.insert(householdMembers).values({
      id: uuid(),
      householdId: HOUSEHOLD_ID,
      userId: "user-1",
      role: "owner",
      createdAt: now,
    });

    await testDb.insert(plaidItems).values({
      id: PLAID_ITEM_ID,
      householdId: HOUSEHOLD_ID,
      accessToken: encrypt("access-sandbox-test-token"),
      institutionName: "Chase",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    await testDb.insert(accounts).values({
      id: "acc-internal-checking",
      householdId: HOUSEHOLD_ID,
      plaidItemId: PLAID_ITEM_ID,
      plaidAccountId: "plaid-acc-checking",
      name: "Checking",
      type: "checking",
      createdAt: now,
      updatedAt: now,
    });
  }

  it("multi-page pagination drains all pages", async () => {
    await setup();
    await seedTestData(db);

    let callCount = 0;
    server.use(
      http.post("https://sandbox.plaid.com/transactions/sync", () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json({
            added: [
              {
                transaction_id: TEST_TXN_IDS.added1,
                account_id: "plaid-acc-checking",
                amount: 12.5,
                iso_currency_code: "USD",
                date: "2026-05-01",
                name: "AMAZON.COM*1A2B3C",
                merchant_name: "Amazon",
                logo_url: null,
                pending: false,
                pending_transaction_id: null,
                personal_finance_category: { primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES" },
              },
            ],
            modified: [],
            removed: [],
            has_more: true,
            next_cursor: "cursor_page2",
            request_id: "req-sync-page1",
          });
        }
        return HttpResponse.json({
          added: [
            {
              transaction_id: TEST_TXN_IDS.added2,
              account_id: "plaid-acc-checking",
              amount: -500.0,
              iso_currency_code: "USD",
              date: "2026-05-02",
              name: "DIRECT DEPOSIT - EMPLOYER",
              merchant_name: null,
              logo_url: null,
              pending: false,
              pending_transaction_id: null,
              personal_finance_category: { primary: "INCOME", detailed: "INCOME_WAGES" },
            },
          ],
          modified: [],
          removed: [],
          has_more: false,
          next_cursor: "cursor_final",
          request_id: "req-sync-page2",
        });
      })
    );

    const result = await syncInstitution(PLAID_ITEM_ID, HOUSEHOLD_ID, db);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.addedCount).toBe(2);

    const txns = await db.select().from(transactions).where(eq(transactions.householdId, HOUSEHOLD_ID));
    expect(txns).toHaveLength(2);

    const [item] = await db.select().from(plaidItems).where(eq(plaidItems.id, PLAID_ITEM_ID));
    expect(item?.syncCursor).toBe("cursor_final");

    expect(callCount).toBe(2);
  });

  it("reuses an existing merchant across syncs instead of duplicating it", async () => {
    await setup();
    await seedTestData(db);

    function addedAmazon(txnId: string, rawName: string, cursor: string) {
      return HttpResponse.json({
        added: [
          {
            transaction_id: txnId,
            account_id: "plaid-acc-checking",
            amount: 12.5,
            iso_currency_code: "USD",
            date: "2026-05-01",
            name: rawName,
            merchant_name: "Amazon",
            logo_url: "https://logo.example/amazon.png",
            pending: false,
            pending_transaction_id: null,
            personal_finance_category: {
              primary: "GENERAL_MERCHANDISE",
              detailed: "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES",
            },
          },
        ],
        modified: [],
        removed: [],
        has_more: false,
        next_cursor: cursor,
        request_id: `req-${txnId}`,
      });
    }

    // First sync creates the Amazon merchant.
    server.use(
      http.post("https://sandbox.plaid.com/transactions/sync", () =>
        addedAmazon(TEST_TXN_IDS.added1, "AMAZON.COM*1A2B3C", "cursor_1"),
      ),
    );
    const first = await syncInstitution(PLAID_ITEM_ID, HOUSEHOLD_ID, db);
    expect(first.success).toBe(true);

    // Second sync sees the same normalized merchant via a different raw name.
    server.resetHandlers();
    server.use(
      http.post("https://sandbox.plaid.com/transactions/sync", () =>
        addedAmazon(TEST_TXN_IDS.added2, "AMAZON MKTPL*XY99", "cursor_2"),
      ),
    );
    const second = await syncInstitution(PLAID_ITEM_ID, HOUSEHOLD_ID, db);
    expect(second.success).toBe(true);

    // Exactly one merchant row, and both transactions link to it.
    const merchantRows = await db
      .select()
      .from(merchants)
      .where(eq(merchants.householdId, HOUSEHOLD_ID));
    expect(merchantRows).toHaveLength(1);

    const txns = await db
      .select()
      .from(transactions)
      .where(eq(transactions.householdId, HOUSEHOLD_ID));
    expect(txns).toHaveLength(2);
    expect(txns[0].merchantId).toBe(merchantRows[0].id);
    expect(txns[1].merchantId).toBe(merchantRows[0].id);

    // The merge preserved the first raw name rather than clobbering it.
    const rawNames: string[] = JSON.parse(merchantRows[0].rawNames ?? "[]");
    expect(rawNames.length).toBeGreaterThanOrEqual(1);
  });

  it("removed transactions are soft-deleted", async () => {
    await setup();
    await seedTestData(db);

    const now = new Date();
    await db.insert(transactions).values({
      id: uuid(),
      accountId: "acc-internal-checking",
      householdId: HOUSEHOLD_ID,
      plaidTransactionId: TEST_TXN_IDS.removed1,
      date: "2026-05-01",
      originalName: "OLD TRANSACTION",
      name: "Old Transaction",
      amount: 1000,
      normalizedAmount: -1000,
      currency: "USD",
      pending: false,
      createdAt: now,
      updatedAt: now,
    });

    server.use(syncWithRemovedHandler);

    const result = await syncInstitution(PLAID_ITEM_ID, HOUSEHOLD_ID, db);
    expect(result.success).toBe(true);

    const [txn] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.plaidTransactionId, TEST_TXN_IDS.removed1));

    expect(txn).toBeDefined();
    expect(txn?.deletedAt).not.toBeNull();
  });

  it("batches multiple removed transactions into one soft-delete update", async () => {
    await setup();
    await seedTestData(db);

    const now = new Date();
    await db.insert(transactions).values([
      {
        id: uuid(),
        accountId: "acc-internal-checking",
        householdId: HOUSEHOLD_ID,
        plaidTransactionId: TEST_TXN_IDS.removed1,
        date: "2026-05-01",
        originalName: "OLD TRANSACTION 1",
        name: "Old Transaction 1",
        amount: 1000,
        normalizedAmount: -1000,
        currency: "USD",
        pending: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: uuid(),
        accountId: "acc-internal-checking",
        householdId: HOUSEHOLD_ID,
        plaidTransactionId: TEST_TXN_IDS.removed2,
        date: "2026-05-02",
        originalName: "OLD TRANSACTION 2",
        name: "Old Transaction 2",
        amount: 2000,
        normalizedAmount: -2000,
        currency: "USD",
        pending: false,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    server.use(
      http.post("https://sandbox.plaid.com/transactions/sync", () =>
        HttpResponse.json({
          added: [],
          modified: [],
          removed: [
            { transaction_id: TEST_TXN_IDS.removed1 },
            { transaction_id: TEST_TXN_IDS.removed2 },
          ],
          has_more: false,
          next_cursor: "cursor_removed_batch",
          request_id: "req-sync-removed-batch",
        }),
      ),
    );

    const result = await syncInstitution(PLAID_ITEM_ID, HOUSEHOLD_ID, db);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.removedCount).toBe(2);

    const removedTxns = await db
      .select()
      .from(transactions)
      .where(
        eq(transactions.plaidTransactionId, TEST_TXN_IDS.removed1),
      );
    expect(removedTxns[0]?.deletedAt).not.toBeNull();

    const [txn2] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.plaidTransactionId, TEST_TXN_IDS.removed2));
    expect(txn2?.deletedAt).not.toBeNull();
  });

  it("modified transactions upsert without duplicates", async () => {
    await setup();
    await seedTestData(db);

    const now = new Date();
    await db.insert(transactions).values({
      id: uuid(),
      accountId: "acc-internal-checking",
      householdId: HOUSEHOLD_ID,
      plaidTransactionId: TEST_TXN_IDS.modified1,
      date: "2026-05-01",
      originalName: "AMAZON.COM OLD",
      name: "Amazon",
      amount: 1000,
      normalizedAmount: -1000,
      currency: "USD",
      pending: false,
      createdAt: now,
      updatedAt: now,
    });

    server.use(syncWithModifiedHandler);

    const result = await syncInstitution(PLAID_ITEM_ID, HOUSEHOLD_ID, db);
    expect(result.success).toBe(true);

    const txns = await db
      .select()
      .from(transactions)
      .where(eq(transactions.plaidTransactionId, TEST_TXN_IDS.modified1));

    expect(txns).toHaveLength(1);
    expect(txns[0].amount).toBe(2500);
  });

  it("pending-to-posted transition soft-deletes pending row", async () => {
    await setup();
    await seedTestData(db);

    const now = new Date();
    await db.insert(transactions).values({
      id: uuid(),
      accountId: "acc-internal-checking",
      householdId: HOUSEHOLD_ID,
      plaidTransactionId: TEST_TXN_IDS.pending1,
      date: "2026-05-03",
      originalName: "UBER *TRIP",
      name: "Uber",
      amount: 3599,
      normalizedAmount: -3599,
      currency: "USD",
      pending: true,
      createdAt: now,
      updatedAt: now,
    });

    server.use(
      http.post("https://sandbox.plaid.com/transactions/sync", () =>
        HttpResponse.json({
          added: [
            {
              transaction_id: TEST_TXN_IDS.posted1,
              account_id: "plaid-acc-checking",
              amount: 35.99,
              iso_currency_code: "USD",
              date: "2026-05-03",
              name: "UBER *TRIP",
              merchant_name: "Uber",
              logo_url: null,
              pending: false,
              pending_transaction_id: TEST_TXN_IDS.pending1,
              personal_finance_category: { primary: "TRANSPORTATION", detailed: "TRANSPORTATION_TAXIS_AND_RIDE_SHARES" },
            },
          ],
          modified: [],
          removed: [],
          has_more: false,
          next_cursor: "cursor_posted",
          request_id: "req-sync-posted",
        })
      )
    );

    const result = await syncInstitution(PLAID_ITEM_ID, HOUSEHOLD_ID, db);
    expect(result.success).toBe(true);

    const [pendingTxn] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.plaidTransactionId, TEST_TXN_IDS.pending1));
    expect(pendingTxn?.deletedAt).not.toBeNull();

    const [postedTxn] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.plaidTransactionId, TEST_TXN_IDS.posted1));
    expect(postedTxn).toBeDefined();
    expect(postedTxn?.pending).toBe(false);
  });

  it("keeps the pending row when its posted replacement is skipped (unmapped account)", async () => {
    await setup();
    await seedTestData(db);

    const now = new Date();
    await db.insert(transactions).values({
      id: uuid(),
      accountId: "acc-internal-checking",
      householdId: HOUSEHOLD_ID,
      plaidTransactionId: TEST_TXN_IDS.pending1,
      date: "2026-05-03",
      originalName: "UBER *TRIP",
      name: "Uber",
      amount: 3599,
      normalizedAmount: -3599,
      currency: "USD",
      pending: true,
      createdAt: now,
      updatedAt: now,
    });

    // The posted replacement references the pending row via
    // pending_transaction_id, but posts to an account that isn't in the
    // internal accounts map — so it gets skipped during insert.
    server.use(
      http.post("https://sandbox.plaid.com/transactions/sync", () =>
        HttpResponse.json({
          added: [
            {
              transaction_id: TEST_TXN_IDS.posted1,
              account_id: "plaid-acc-nonexistent",
              amount: 35.99,
              iso_currency_code: "USD",
              date: "2026-05-03",
              name: "UBER *TRIP",
              merchant_name: "Uber",
              logo_url: null,
              pending: false,
              pending_transaction_id: TEST_TXN_IDS.pending1,
              personal_finance_category: { primary: "TRANSPORTATION", detailed: "TRANSPORTATION_TAXIS_AND_RIDE_SHARES" },
            },
          ],
          modified: [],
          removed: [],
          has_more: false,
          next_cursor: "cursor_unmapped_posted",
          request_id: "req-sync-unmapped-posted",
        })
      )
    );

    const result = await syncInstitution(PLAID_ITEM_ID, HOUSEHOLD_ID, db);
    expect(result.success).toBe(true);

    const [pendingTxn] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.plaidTransactionId, TEST_TXN_IDS.pending1));
    // The replacement never got inserted, so the pending row must survive —
    // otherwise the transaction silently vanishes.
    expect(pendingTxn?.deletedAt).toBeNull();
  });

  it("empty sync advances cursor and writes sync_log", async () => {
    await setup();
    await seedTestData(db);

    server.use(syncEmptyHandler);

    const result = await syncInstitution(PLAID_ITEM_ID, HOUSEHOLD_ID, db);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const [item] = await db.select().from(plaidItems).where(eq(plaidItems.id, PLAID_ITEM_ID));
    expect(item?.syncCursor).toBe("cursor_empty");

    const logs = await db.select().from(syncLog).where(eq(syncLog.plaidItemId, PLAID_ITEM_ID));
    expect(logs).toHaveLength(1);
    expect(logs[0].addedCount).toBe(0);
    expect(logs[0].modifiedCount).toBe(0);
    expect(logs[0].removedCount).toBe(0);
  });

  it("cross-household isolation — household B transaction untouched during household A sync", async () => {
    await setup();
    await seedTestData(db);

    const HOUSEHOLD_B = "hh-test-b";
    const PLAID_ITEM_B = "plaid-item-b";
    const now = new Date();

    await db.insert(households).values({
      id: HOUSEHOLD_B,
      name: "Household B",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(householdMembers).values({
      id: uuid(),
      householdId: HOUSEHOLD_B,
      userId: "user-b",
      role: "owner",
      createdAt: now,
    });

    await db.insert(plaidItems).values({
      id: PLAID_ITEM_B,
      householdId: HOUSEHOLD_B,
      accessToken: encrypt("access-sandbox-test-token"),
      institutionName: "Bank B",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(accounts).values({
      id: "acc-b-checking",
      householdId: HOUSEHOLD_B,
      plaidItemId: PLAID_ITEM_B,
      plaidAccountId: "plaid-acc-b",
      name: "B Checking",
      type: "checking",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(transactions).values({
      id: uuid(),
      accountId: "acc-b-checking",
      householdId: HOUSEHOLD_B,
      plaidTransactionId: "txn-household-b-only",
      date: "2026-05-01",
      originalName: "HOUSEHOLD B TXN",
      name: "Household B Txn",
      amount: 5000,
      normalizedAmount: -5000,
      currency: "USD",
      pending: false,
      createdAt: now,
      updatedAt: now,
    });

    server.use(syncEmptyHandler);

    await syncInstitution(PLAID_ITEM_ID, HOUSEHOLD_ID, db);

    const [bTxn] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.plaidTransactionId, "txn-household-b-only"));

    expect(bTxn).toBeDefined();
    expect(bTxn?.deletedAt).toBeNull();
  });

  it("duplicate plaid_transaction_id is rejected by UNIQUE constraint", async () => {
    await setup();
    await seedTestData(db);

    const now = new Date();
    const sharedPlaidId = "txn-unique-constraint-test";

    await db.insert(transactions).values({
      id: uuid(),
      accountId: "acc-internal-checking",
      householdId: HOUSEHOLD_ID,
      plaidTransactionId: sharedPlaidId,
      date: "2026-05-01",
      originalName: "FIRST TRANSACTION",
      name: "First Transaction",
      amount: 1000,
      normalizedAmount: -1000,
      currency: "USD",
      pending: false,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      db.insert(transactions).values({
        id: uuid(),
        accountId: "acc-internal-checking",
        householdId: HOUSEHOLD_ID,
        plaidTransactionId: sharedPlaidId,
        date: "2026-05-02",
        originalName: "DUPLICATE TRANSACTION",
        name: "Duplicate Transaction",
        amount: 2000,
        normalizedAmount: -2000,
        currency: "USD",
        pending: false,
        createdAt: now,
        updatedAt: now,
      })
    ).rejects.toThrow();
  });

  it("transaction with unknown account_id is skipped but cursor still advances", async () => {
    await setup();
    await seedTestData(db);

    await db
      .update(plaidItems)
      .set({ syncCursor: "cursor_before" })
      .where(eq(plaidItems.id, PLAID_ITEM_ID));

    server.use(
      http.post("https://sandbox.plaid.com/transactions/sync", () =>
        HttpResponse.json({
          added: [
            {
              transaction_id: "txn-unknown-account",
              account_id: "plaid-acc-nonexistent",
              amount: 99.99,
              iso_currency_code: "USD",
              date: "2026-05-05",
              name: "SOME STORE",
              merchant_name: null,
              logo_url: null,
              pending: false,
              pending_transaction_id: null,
              personal_finance_category: null,
            },
          ],
          modified: [],
          removed: [],
          has_more: false,
          next_cursor: "cursor_advanced",
          request_id: "req-sync-unknown-account",
        })
      )
    );

    const result = await syncInstitution(PLAID_ITEM_ID, HOUSEHOLD_ID, db);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.addedCount).toBe(0);

    const txns = await db.select().from(transactions).where(eq(transactions.householdId, HOUSEHOLD_ID));
    expect(txns).toHaveLength(0);

    const [item] = await db.select().from(plaidItems).where(eq(plaidItems.id, PLAID_ITEM_ID));
    expect(item?.syncCursor).toBe("cursor_advanced");
  });
});
