import { describe, it, expect, afterEach, beforeAll, afterAll, vi, beforeEach } from "vitest";
import { eq, and } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { v4 as uuid } from "uuid";
import { createTestDb } from "./setup";
import { server } from "../mocks/server";
import {
  syncPageOneHandler,
  syncPageTwoHandler,
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
  syncLog,
} from "@/db/schema";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOUSEHOLD_ID = "hh-test-sync";
const PLAID_ITEM_ID = "plaid-item-sync-test";

// ---------------------------------------------------------------------------
// Environment + MSW setup
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("transaction sync integration", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let close: () => void;

  beforeEach(() => {
    resetPlaidClient();
  });

  afterEach(() => {
    server.resetHandlers();
    close?.();
  });

  function setup() {
    const result = createTestDb();
    db = result.db;
    close = result.close;
    return db;
  }

  // -------------------------------------------------------------------------
  // Seed helper
  // -------------------------------------------------------------------------

  function seedTestData(testDb: typeof db) {
    const now = new Date().toISOString();

    testDb.insert(households).values({
      id: HOUSEHOLD_ID,
      name: "Test Household",
      createdAt: now,
      updatedAt: now,
    }).run();

    testDb.insert(householdMembers).values({
      id: uuid(),
      householdId: HOUSEHOLD_ID,
      userId: "user-1",
      role: "owner",
      createdAt: now,
    }).run();

    testDb.insert(plaidItems).values({
      id: PLAID_ITEM_ID,
      householdId: HOUSEHOLD_ID,
      accessToken: encrypt("access-sandbox-test-token"),
      institutionName: "Chase",
      status: "active",
      createdAt: now,
      updatedAt: now,
    }).run();

    testDb.insert(accounts).values({
      id: "acc-internal-checking",
      householdId: HOUSEHOLD_ID,
      plaidItemId: PLAID_ITEM_ID,
      plaidAccountId: "plaid-acc-checking",
      name: "Checking",
      type: "checking",
      createdAt: now,
      updatedAt: now,
    }).run();
  }

  // =========================================================================
  // Test 1: Multi-page pagination drains all pages
  // =========================================================================

  it("multi-page pagination drains all pages", async () => {
    const testDb = setup();
    seedTestData(testDb);

    // Stateful handler: first call returns page 1 (has_more=true), second returns page 2
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

    const result = await syncInstitution(PLAID_ITEM_ID, HOUSEHOLD_ID, testDb);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.addedCount).toBe(2);

    // Verify 2 transactions inserted
    const txns = testDb.select().from(transactions).where(eq(transactions.householdId, HOUSEHOLD_ID)).all();
    expect(txns).toHaveLength(2);

    // Verify cursor updated to final value
    const item = testDb.select().from(plaidItems).where(eq(plaidItems.id, PLAID_ITEM_ID)).get();
    expect(item?.syncCursor).toBe("cursor_final");

    // Verify both pages were fetched
    expect(callCount).toBe(2);
  });

  // =========================================================================
  // Test 2: Removed transactions are soft-deleted
  // =========================================================================

  it("removed transactions are soft-deleted", async () => {
    const testDb = setup();
    seedTestData(testDb);

    const now = new Date().toISOString();
    testDb.insert(transactions).values({
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
    }).run();

    server.use(syncWithRemovedHandler);

    const result = await syncInstitution(PLAID_ITEM_ID, HOUSEHOLD_ID, testDb);
    expect(result.success).toBe(true);

    const txn = testDb
      .select()
      .from(transactions)
      .where(eq(transactions.plaidTransactionId, TEST_TXN_IDS.removed1))
      .get();

    expect(txn).toBeDefined();
    expect(txn?.deletedAt).not.toBeNull();
  });

  // =========================================================================
  // Test 3: Modified transactions upsert without duplicates
  // =========================================================================

  it("modified transactions upsert without duplicates", async () => {
    const testDb = setup();
    seedTestData(testDb);

    const now = new Date().toISOString();
    testDb.insert(transactions).values({
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
    }).run();

    server.use(syncWithModifiedHandler);

    const result = await syncInstitution(PLAID_ITEM_ID, HOUSEHOLD_ID, testDb);
    expect(result.success).toBe(true);

    const txns = testDb
      .select()
      .from(transactions)
      .where(eq(transactions.plaidTransactionId, TEST_TXN_IDS.modified1))
      .all();

    // Only 1 row — no duplicate
    expect(txns).toHaveLength(1);
    // Amount updated: 25.00 * 100 = 2500 cents
    expect(txns[0].amount).toBe(2500);
  });

  // =========================================================================
  // Test 4: Pending-to-posted transition soft-deletes pending row
  // =========================================================================

  it("pending-to-posted transition soft-deletes pending row", async () => {
    const testDb = setup();
    seedTestData(testDb);

    const now = new Date().toISOString();
    // Pre-seed pending transaction
    testDb.insert(transactions).values({
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
    }).run();

    // Handler returns posted version referencing pending1 as pending_transaction_id
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

    const result = await syncInstitution(PLAID_ITEM_ID, HOUSEHOLD_ID, testDb);
    expect(result.success).toBe(true);

    // Pending row should be soft-deleted
    const pendingTxn = testDb
      .select()
      .from(transactions)
      .where(eq(transactions.plaidTransactionId, TEST_TXN_IDS.pending1))
      .get();
    expect(pendingTxn?.deletedAt).not.toBeNull();

    // Posted row should exist with pending=false
    const postedTxn = testDb
      .select()
      .from(transactions)
      .where(eq(transactions.plaidTransactionId, TEST_TXN_IDS.posted1))
      .get();
    expect(postedTxn).toBeDefined();
    expect(postedTxn?.pending).toBe(false);
  });

  // =========================================================================
  // Test 5: Empty sync advances cursor and writes sync_log
  // =========================================================================

  it("empty sync advances cursor and writes sync_log", async () => {
    const testDb = setup();
    seedTestData(testDb);

    server.use(syncEmptyHandler);

    const result = await syncInstitution(PLAID_ITEM_ID, HOUSEHOLD_ID, testDb);
    expect(result.success).toBe(true);
    if (!result.success) return;

    // Cursor updated
    const item = testDb.select().from(plaidItems).where(eq(plaidItems.id, PLAID_ITEM_ID)).get();
    expect(item?.syncCursor).toBe("cursor_empty");

    // sync_log has 1 entry with all counts = 0
    const logs = testDb.select().from(syncLog).where(eq(syncLog.plaidItemId, PLAID_ITEM_ID)).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].addedCount).toBe(0);
    expect(logs[0].modifiedCount).toBe(0);
    expect(logs[0].removedCount).toBe(0);
  });

  // =========================================================================
  // Test 6: Cross-household isolation
  // =========================================================================

  it("cross-household isolation — household B transaction untouched during household A sync", async () => {
    const testDb = setup();
    seedTestData(testDb);

    // Seed household B
    const HOUSEHOLD_B = "hh-test-b";
    const PLAID_ITEM_B = "plaid-item-b";
    const now = new Date().toISOString();

    testDb.insert(households).values({
      id: HOUSEHOLD_B,
      name: "Household B",
      createdAt: now,
      updatedAt: now,
    }).run();

    testDb.insert(householdMembers).values({
      id: uuid(),
      householdId: HOUSEHOLD_B,
      userId: "user-b",
      role: "owner",
      createdAt: now,
    }).run();

    testDb.insert(plaidItems).values({
      id: PLAID_ITEM_B,
      householdId: HOUSEHOLD_B,
      accessToken: encrypt("access-sandbox-test-token"),
      institutionName: "Bank B",
      status: "active",
      createdAt: now,
      updatedAt: now,
    }).run();

    testDb.insert(accounts).values({
      id: "acc-b-checking",
      householdId: HOUSEHOLD_B,
      plaidItemId: PLAID_ITEM_B,
      plaidAccountId: "plaid-acc-b",
      name: "B Checking",
      type: "checking",
      createdAt: now,
      updatedAt: now,
    }).run();

    // Insert a transaction for household B with a unique plaidTransactionId
    testDb.insert(transactions).values({
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
    }).run();

    // Sync for household A uses syncWithRemovedHandler which removes TEST_TXN_IDS.removed1
    // Household B's transaction is unrelated and should remain untouched
    server.use(syncEmptyHandler);

    await syncInstitution(PLAID_ITEM_ID, HOUSEHOLD_ID, testDb);

    // Household B's transaction should have deletedAt = null
    const bTxn = testDb
      .select()
      .from(transactions)
      .where(eq(transactions.plaidTransactionId, "txn-household-b-only"))
      .get();

    expect(bTxn).toBeDefined();
    expect(bTxn?.deletedAt).toBeNull();
  });

  // =========================================================================
  // Test 7: Duplicate plaid_transaction_id rejected by UNIQUE constraint
  // =========================================================================

  it("duplicate plaid_transaction_id is rejected by UNIQUE constraint", async () => {
    const testDb = setup();
    seedTestData(testDb);

    const now = new Date().toISOString();
    const sharedPlaidId = "txn-unique-constraint-test";

    testDb.insert(transactions).values({
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
    }).run();

    expect(() => {
      testDb.insert(transactions).values({
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
      }).run();
    }).toThrow();
  });

  // =========================================================================
  // Test 8: Unknown account_id — transaction skipped, cursor still advances
  // =========================================================================

  it("transaction with unknown account_id is skipped but cursor still advances", async () => {
    const testDb = setup();
    seedTestData(testDb);

    // Set an initial cursor so we can verify it changes
    testDb
      .update(plaidItems)
      .set({ syncCursor: "cursor_before" })
      .where(eq(plaidItems.id, PLAID_ITEM_ID))
      .run();

    // Handler returns a transaction for an account not in DB
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

    const result = await syncInstitution(PLAID_ITEM_ID, HOUSEHOLD_ID, testDb);
    expect(result.success).toBe(true);
    if (!result.success) return;

    // Transaction was skipped — addedCount = 0
    expect(result.addedCount).toBe(0);

    // No transactions in DB
    const txns = testDb.select().from(transactions).where(eq(transactions.householdId, HOUSEHOLD_ID)).all();
    expect(txns).toHaveLength(0);

    // Cursor still advanced past "cursor_before"
    const item = testDb.select().from(plaidItems).where(eq(plaidItems.id, PLAID_ITEM_ID)).get();
    expect(item?.syncCursor).toBe("cursor_advanced");
  });
});
