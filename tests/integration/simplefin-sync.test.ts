import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { eq } from "drizzle-orm";
import { createTestDb } from "./setup";
import { server } from "../mocks/server";
import { simplefinAccountsRevokedHandler } from "../mocks/handlers";
import { bankConnections, accounts, transactions, institutionLogos } from "@/db/schema";
import { syncConnection } from "@/lib/simplefin/sync";
import {
  insertHousehold,
  insertSimplefinConnection,
  insertAccount,
  insertCategoryGroup,
  insertCategory,
  insertCategoryRule,
} from "./helpers";
import type { LedgrDb } from "@/db";

// MSW mocks fetch, not DNS — the SSRF guard in lib/simplefin/client.ts does a
// real dns.lookup() before fetching, so it needs mocking too or these tests
// would depend on real DNS resolution of the fake bridge.simplefin.test host.
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn().mockResolvedValue([{ address: "203.0.113.10", family: 4 }]),
}));

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

  it("backfills a missing institution icon on sync (pre-existing connections from before icon caching)", async () => {
    const { householdId, connectionId } = await setupWithAccount();

    const result = await syncConnection(connectionId, householdId, db);
    expect(result.success).toBe(true);

    const [logo] = await db
      .select()
      .from(institutionLogos)
      .where(eq(institutionLogos.connectionId, connectionId));
    expect(logo.logo).toMatch(/^data:image\/png;base64,/);
  });

  it("backfills the icon for the right institution when one Access URL spans several (shared SimpleFIN Bridge credential)", async () => {
    ({ db, close } = await createTestDb());
    const { householdId } = await insertHousehold(db);

    // Two institutions claimed under the same SimpleFIN Bridge session share
    // one credential — /accounts on it returns both orgs' accounts together,
    // regardless of which connectionId is syncing.
    server.use(
      http.get("https://bridge.simplefin.test/simplefin/accounts", () =>
        HttpResponse.json({
          errlist: [],
          connections: [
            { conn_id: "CON-A", org_name: "Org A", org_url: "https://org-a.example.com" },
            { conn_id: "CON-B", org_name: "Org B", org_url: "https://org-b.example.com" },
          ],
          accounts: [
            { id: "acc-a", name: "A Checking", conn_id: "CON-A", currency: "USD", balance: "10.00", "balance-date": 0, transactions: [] },
            { id: "acc-b", name: "B Checking", conn_id: "CON-B", currency: "USD", balance: "20.00", "balance-date": 0, transactions: [] },
          ],
        })
      ),
      http.get("https://www.google.com/s2/favicons", ({ request }) => {
        const domain = new URL(request.url).searchParams.get("domain");
        if (domain === "org-a.example.com") {
          return new HttpResponse(new Uint8Array([1, 1, 1, 1]), { headers: { "content-type": "image/png" } });
        }
        if (domain === "org-b.example.com") {
          return new HttpResponse(new Uint8Array([2, 2, 2, 2]), { headers: { "content-type": "image/png" } });
        }
        return new HttpResponse(null, { status: 404 });
      }),
    );

    const { connectionId: connectionA } = await insertSimplefinConnection(db, householdId);
    await insertAccount(db, householdId, { bankConnectionId: connectionA, externalAccountId: "acc-a", type: "checking" });

    const { connectionId: connectionB } = await insertSimplefinConnection(db, householdId);
    await insertAccount(db, householdId, { bankConnectionId: connectionB, externalAccountId: "acc-b", type: "checking" });

    await syncConnection(connectionB, householdId, db);

    const [logoB] = await db.select().from(institutionLogos).where(eq(institutionLogos.connectionId, connectionB));
    expect(logoB.logo).toBe(`data:image/png;base64,${Buffer.from([2, 2, 2, 2]).toString("base64")}`);

    const logosForA = await db.select().from(institutionLogos).where(eq(institutionLogos.connectionId, connectionA));
    expect(logosForA).toHaveLength(0);
  });

  it("does not re-fetch an institution icon that's already cached", async () => {
    const { householdId, connectionId } = await setupWithAccount();
    await db.insert(institutionLogos).values({ id: "existing-logo", connectionId, logo: "data:image/png;base64,already-cached" });

    await syncConnection(connectionId, householdId, db);

    const [logo] = await db
      .select()
      .from(institutionLogos)
      .where(eq(institutionLogos.connectionId, connectionId));
    expect(logo.logo).toBe("data:image/png;base64,already-cached");
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

  it("auto-categorizes newly synced transactions against household rules", async () => {
    const { householdId, connectionId } = await setupWithAccount();
    const { groupId } = await insertCategoryGroup(db, householdId, { name: "Food" });
    const { categoryId } = await insertCategory(db, householdId, groupId, { name: "Coffee" });
    await insertCategoryRule(db, householdId, categoryId, { matchField: "name", matchPattern: "coffee" });

    await syncConnection(connectionId, householdId, db);

    const [txn] = await db.select().from(transactions).where(eq(transactions.externalId, "sf-txn-1"));
    expect(txn.categoryId).toBe(categoryId);
    expect(txn.categorySource).toBe("rule");
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

  it("requests a bounded lookback window on first sync instead of relying on the bridge's default", async () => {
    // Regression: omitting start-date on first sync left the lookback window
    // up to the SimpleFIN bridge, which often defaults to ~7 days — users
    // connecting an account would only see the last week of history.
    const { householdId, connectionId } = await setupWithAccount();

    let requestedStartDate: string | null = null;
    server.use(
      http.get("https://bridge.simplefin.test/simplefin/accounts", ({ request }) => {
        requestedStartDate = new URL(request.url).searchParams.get("start-date");
        return HttpResponse.json({ accounts: [] });
      }),
    );

    await syncConnection(connectionId, householdId, db);

    expect(requestedStartDate).not.toBeNull();
    const lookbackDays = (Date.now() / 1000 - Number(requestedStartDate)) / (24 * 60 * 60);
    expect(lookbackDays).toBeGreaterThan(300);
  });

  it("returns an error for a connection that doesn't exist", async () => {
    ({ db, close } = await createTestDb());
    const { householdId } = await insertHousehold(db);

    const result = await syncConnection("nonexistent-id", householdId, db);
    expect(result.success).toBe(false);
  });
});
