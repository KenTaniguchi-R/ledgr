import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./setup";
import { server } from "../mocks/server";
import { simplefinAccountsRevokedHandler } from "../mocks/handlers";
import { bankConnections, accounts, transactions } from "@/db/schema";
import { syncConnection } from "@/lib/simplefin/sync";
import { insertHousehold, insertSimplefinConnection, insertAccount, insertCategoryGroup, insertCategory } from "./helpers";
import type { LedgrDb } from "@/db";

beforeAll(() => {
  vi.stubEnv("ENCRYPTION_KEY", "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2");
  server.listen({ onUnhandledRequest: "error" });
});
afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

describe("syncConnection", () => {
  let db: LedgrDb;
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    server.resetHandlers();
    await close?.();
    close = undefined;
  });

  async function setupWithAccount() {
    ({ db, close } = await createTestDb());
    const { householdId } = await insertHousehold(db);
    const { connectionId } = await insertSimplefinConnection(db, householdId);
    const { accountId } = await insertAccount(db, householdId, {
      bankConnectionId: connectionId,
      externalAccountId: "sf-acc-checking",
      type: "checking",
    });
    return { householdId, connectionId, accountId };
  }

  it("inserts transactions with amount === normalizedAmount (no Plaid-style sign flip)", async () => {
    const { householdId, connectionId } = await setupWithAccount();

    const result = await syncConnection(connectionId, householdId, db);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.addedCount).toBe(2);

    const txns = await db.select().from(transactions).where(eq(transactions.householdId, householdId));
    expect(txns).toHaveLength(2);
    for (const t of txns) {
      expect(t.normalizedAmount).toBe(t.amount);
      expect(t.provider).toBe("simplefin");
    }

    const posted = txns.find((t) => t.externalId === "sf-txn-1")!;
    expect(posted.amount).toBe(-4250);
    expect(posted.pending).toBe(false);

    const pending = txns.find((t) => t.externalId === "sf-txn-2")!;
    expect(pending.pending).toBe(true);
  });

  it("updates account balances from the poll response", async () => {
    const { householdId, connectionId, accountId } = await setupWithAccount();

    await syncConnection(connectionId, householdId, db);

    const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    expect(account.currentBalance).toBe(125075);
    expect(account.availableBalance).toBe(120000);
  });

  it("upserts by externalId on a second sync instead of duplicating rows", async () => {
    const { householdId, connectionId } = await setupWithAccount();

    await syncConnection(connectionId, householdId, db);
    const result = await syncConnection(connectionId, householdId, db);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.modifiedCount).toBe(2);
    expect(result.addedCount).toBe(0);

    const txns = await db.select().from(transactions).where(eq(transactions.householdId, householdId));
    expect(txns).toHaveLength(2);
  });

  it("preserves a manually-set category and reviewed flag across a re-sync", async () => {
    const { householdId, connectionId } = await setupWithAccount();
    await syncConnection(connectionId, householdId, db);

    const { groupId } = await insertCategoryGroup(db, householdId);
    const { categoryId } = await insertCategory(db, householdId, groupId);

    const [txn] = await db.select().from(transactions).where(eq(transactions.externalId, "sf-txn-1"));
    await db.update(transactions)
      .set({ categoryId, categorySource: "manual", reviewed: true })
      .where(eq(transactions.id, txn.id));

    await syncConnection(connectionId, householdId, db);

    const [updated] = await db.select().from(transactions).where(eq(transactions.id, txn.id));
    expect(updated.categoryId).toBe(categoryId);
    expect(updated.categorySource).toBe("manual");
    expect(updated.reviewed).toBe(true);
  });

  it("sets status to revoked (not just error) on a 403 from /accounts", async () => {
    const { householdId, connectionId } = await setupWithAccount();
    server.use(simplefinAccountsRevokedHandler);

    const result = await syncConnection(connectionId, householdId, db);
    expect(result.success).toBe(false);

    const [connection] = await db.select().from(bankConnections).where(eq(bankConnections.id, connectionId));
    expect(connection.status).toBe("revoked");
    expect(connection.errorCode).toBe("ACCESS_REVOKED");
  });

  it("returns an error for a connection that doesn't exist", async () => {
    ({ db, close } = await createTestDb());
    const { householdId } = await insertHousehold(db);

    const result = await syncConnection("nonexistent-id", householdId, db);
    expect(result.success).toBe(false);
  });
});
