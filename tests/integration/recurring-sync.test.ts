import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import {
  recurringGetHandler,
  recurringErrorHandler,
  TEST_STREAM_IDS,
  TEST_TXN_IDS,
} from "../mocks/handlers";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertPlaidItem,
  insertAccount,
  insertTransaction,
} from "./helpers";
import { recurringTransactions, transactions } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { resetPlaidClient } from "../../src/lib/plaid/client";
import type { LedgrDb } from "../../src/db";

let db: LedgrDb;
let close: () => Promise<void>;

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterAll(() => {
  server.close();
});

beforeEach(async () => {
  vi.stubEnv("PLAID_CLIENT_ID", "test-id");
  vi.stubEnv("PLAID_SECRET", "test-secret");
  vi.stubEnv("PLAID_ENV", "sandbox");
  vi.stubEnv("ENCRYPTION_KEY", "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2");
  ({ db, close } = await createTestDb());
});

afterEach(async () => {
  server.resetHandlers();
  await close?.();
  resetPlaidClient();
  vi.unstubAllEnvs();
});

async function seedForSync(db: LedgrDb) {
  const { householdId } = await insertHousehold(db);
  const { plaidItemId } = await insertPlaidItem(db, householdId);
  const { accountId } = await insertAccount(db, householdId, {
    plaidItemId,
    plaidAccountId: "plaid-acc-checking",
  });
  return { householdId, plaidItemId, accountId };
}

describe("syncRecurringTransactions", () => {
  it("upserts new recurring streams from Plaid response", async () => {
    server.use(recurringGetHandler);
    const { householdId, plaidItemId } = await seedForSync(db);

    const { syncRecurringTransactions } = await import(
      "../../src/lib/plaid/recurring"
    );
    const result = await syncRecurringTransactions(
      plaidItemId,
      householdId,
      "access-sandbox-test-token",
      db,
    );

    expect(result.upserted).toBe(3);
    expect(result.deactivated).toBe(0);

    const rows = await db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.householdId, householdId));
    expect(rows).toHaveLength(3);

    const netflix = rows.find((r) => r.plaidStreamId === TEST_STREAM_IDS.netflix);
    expect(netflix).toBeDefined();
    expect(netflix!.name).toBe("Netflix");
    expect(netflix!.averageAmount).toBe(1599);
    expect(netflix!.frequency).toBe("monthly");
    expect(netflix!.isIncome).toBe(false);
    expect(netflix!.isActive).toBe(true);

    const salary = rows.find((r) => r.plaidStreamId === TEST_STREAM_IDS.salary);
    expect(salary).toBeDefined();
    expect(salary!.isIncome).toBe(true);
    expect(salary!.averageAmount).toBe(-300000);
  });

  it("updates existing stream when amounts/dates change", async () => {
    const { householdId, plaidItemId } = await seedForSync(db);

    await db.insert(recurringTransactions).values({
      id: "existing-1",
      householdId,
      plaidStreamId: TEST_STREAM_IDS.netflix,
      name: "Old Netflix",
      averageAmount: 999,
      frequency: "monthly",
      isActive: true,
      isIncome: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    server.use(recurringGetHandler);

    const { syncRecurringTransactions } = await import(
      "../../src/lib/plaid/recurring"
    );
    const result = await syncRecurringTransactions(
      plaidItemId,
      householdId,
      "access-sandbox-test-token",
      db,
    );

    expect(result.upserted).toBe(3);

    const [netflix] = await db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.plaidStreamId, TEST_STREAM_IDS.netflix));
    expect(netflix!.averageAmount).toBe(1599);
    expect(netflix!.name).toBe("Netflix");
  });

  it("deactivates streams missing from response", async () => {
    const { householdId, plaidItemId } = await seedForSync(db);

    await db.insert(recurringTransactions).values({
      id: "old-stream-1",
      householdId,
      plaidStreamId: "stream-cancelled-service",
      name: "Cancelled Service",
      isActive: true,
      isIncome: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    server.use(recurringGetHandler);

    const { syncRecurringTransactions } = await import(
      "../../src/lib/plaid/recurring"
    );
    const result = await syncRecurringTransactions(
      plaidItemId,
      householdId,
      "access-sandbox-test-token",
      db,
    );

    expect(result.deactivated).toBe(1);

    const [cancelled] = await db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.plaidStreamId, "stream-cancelled-service"));
    expect(cancelled!.isActive).toBe(false);
  });

  it("back-links transactions via recurringTransactionId", async () => {
    const { householdId, plaidItemId, accountId } = await seedForSync(db);

    await insertTransaction(db, householdId, accountId, {
      plaidTransactionId: TEST_TXN_IDS.added2,
    });

    server.use(recurringGetHandler);

    const { syncRecurringTransactions } = await import(
      "../../src/lib/plaid/recurring"
    );
    await syncRecurringTransactions(
      plaidItemId,
      householdId,
      "access-sandbox-test-token",
      db,
    );

    const [txn] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.plaidTransactionId, TEST_TXN_IDS.added2));

    expect(txn!.recurringTransactionId).not.toBeNull();

    const [salary] = await db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.plaidStreamId, TEST_STREAM_IDS.salary));
    expect(txn!.recurringTransactionId).toBe(salary!.id);
  });

  it("isolates recurring streams by household", async () => {
    const { householdId: h1, plaidItemId: p1 } = await seedForSync(db);
    const { householdId: h2 } = await insertHousehold(db, "Other Household");

    server.use(recurringGetHandler);

    const { syncRecurringTransactions } = await import(
      "../../src/lib/plaid/recurring"
    );
    await syncRecurringTransactions(p1, h1, "access-sandbox-test-token", db);

    const h2Rows = await db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.householdId, h2));
    expect(h2Rows).toHaveLength(0);

    const h1Rows = await db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.householdId, h1));
    expect(h1Rows).toHaveLength(3);
  });

  it("returns zeros on Plaid API error (non-fatal)", async () => {
    server.use(recurringErrorHandler);
    const { householdId, plaidItemId } = await seedForSync(db);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { syncRecurringTransactions } = await import(
      "../../src/lib/plaid/recurring"
    );
    const result = await syncRecurringTransactions(
      plaidItemId,
      householdId,
      "access-sandbox-test-token",
      db,
    );

    expect(result).toEqual({ upserted: 0, deactivated: 0 });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("returns zeros on Zod validation failure (non-fatal)", async () => {
    server.use(
      http.post("https://sandbox.plaid.com/transactions/recurring/get", () =>
        HttpResponse.json({ bad_field: true })
      )
    );
    const { householdId, plaidItemId } = await seedForSync(db);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { syncRecurringTransactions } = await import(
      "../../src/lib/plaid/recurring"
    );
    const result = await syncRecurringTransactions(
      plaidItemId,
      householdId,
      "access-sandbox-test-token",
      db,
    );

    expect(result).toEqual({ upserted: 0, deactivated: 0 });
    consoleSpy.mockRestore();
  });
});
