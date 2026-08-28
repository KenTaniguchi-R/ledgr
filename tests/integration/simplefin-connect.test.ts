import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { createTestDb } from "./setup";
import { server } from "../mocks/server";
import {
  SIMPLEFIN_TEST_SETUP_TOKEN,
  SIMPLEFIN_TEST_USED_SETUP_TOKEN,
} from "../mocks/handlers";
import { bankConnections, accounts, balanceHistory, transactions } from "@/db/schema";
import {
  claimAndDiscoverAccountsDirect,
  confirmSimplefinAccountsDirect,
} from "@/actions/simplefin";
import { insertHousehold } from "./helpers";
import type { LedgrDb } from "@/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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

describe("SimpleFIN connect flow", () => {
  let db: LedgrDb;
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    server.resetHandlers();
    await close?.();
    close = undefined;
  });

  async function setup() {
    ({ db, close } = await createTestDb());
    return db;
  }

  it("claims a Setup Token and creates a pending_classification draft connection", async () => {
    await setup();
    const { householdId: hh } = await insertHousehold(db);

    const result = await claimAndDiscoverAccountsDirect(SIMPLEFIN_TEST_SETUP_TOKEN, hh, db);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");

    expect(result.connections).toHaveLength(1);
    expect(result.connections[0].institutionName).toBe("Test Credit Union");
    expect(result.connections[0].accounts).toHaveLength(1);
    expect(result.connections[0].accounts[0].currentBalanceCents).toBe(125075);
    expect(result.connections[0].accounts[0].availableBalanceCents).toBe(120000);

    const rows = await db.select().from(bankConnections).where(eq(bankConnections.householdId, hh));
    expect(rows).toHaveLength(1);
    expect(rows[0].provider).toBe("simplefin");
    expect(rows[0].status).toBe("pending_classification");
  });

  it("rejects a Setup Token that has already been claimed", async () => {
    await setup();
    const { householdId: hh } = await insertHousehold(db);

    const result = await claimAndDiscoverAccountsDirect(SIMPLEFIN_TEST_USED_SETUP_TOKEN, hh, db);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toContain("already been claimed");

    const rows = await db.select().from(bankConnections).where(eq(bankConnections.householdId, hh));
    expect(rows).toHaveLength(0);
  });

  it("confirms discovered accounts: activates the connection, creates accounts + balance history, and auto-syncs", async () => {
    await setup();
    const { householdId: hh } = await insertHousehold(db);

    const discovered = await claimAndDiscoverAccountsDirect(SIMPLEFIN_TEST_SETUP_TOKEN, hh, db);
    if (!discovered.success) throw new Error("expected success");
    const { connectionId, accounts: discoveredAccounts } = discovered.connections[0];

    const result = await confirmSimplefinAccountsDirect(
      [
        {
          connectionId,
          accounts: discoveredAccounts.map((a) => ({ ...a, type: "checking" as const })),
        },
      ],
      hh,
      db,
    );
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.accountCount).toBe(1);

    const [connection] = await db.select().from(bankConnections).where(eq(bankConnections.id, connectionId));
    expect(connection.status).toBe("active");

    const accts = await db.select().from(accounts).where(eq(accounts.householdId, hh));
    expect(accts).toHaveLength(1);
    expect(accts[0].externalAccountId).toBe("sf-acc-checking");
    expect(accts[0].type).toBe("checking");
    expect(accts[0].currentBalance).toBe(125075);

    const history = await db.select().from(balanceHistory).where(eq(balanceHistory.accountId, accts[0].id));
    expect(history).toHaveLength(1);
    expect(history[0].balance).toBe(125075);

    // confirmSimplefinAccountsDirect fires an auto-sync — the mocked /accounts
    // response includes 2 transactions, which should now exist.
    const txns = await db.select().from(transactions).where(eq(transactions.accountId, accts[0].id));
    expect(txns).toHaveLength(2);
    expect(txns.every((t) => t.provider === "simplefin")).toBe(true);
  });

  it("rejects confirming a connection that isn't in pending_classification state", async () => {
    await setup();
    const { householdId: hh } = await insertHousehold(db);

    const discovered = await claimAndDiscoverAccountsDirect(SIMPLEFIN_TEST_SETUP_TOKEN, hh, db);
    if (!discovered.success) throw new Error("expected success");
    const { connectionId, accounts: discoveredAccounts } = discovered.connections[0];

    const classifications = [
      { connectionId, accounts: discoveredAccounts.map((a) => ({ ...a, type: "checking" as const })) },
    ];

    const first = await confirmSimplefinAccountsDirect(classifications, hh, db);
    expect(first.success).toBe(true);

    const second = await confirmSimplefinAccountsDirect(classifications, hh, db);
    expect(second.success).toBe(false);
  });

  it("reuses the existing connection and account when a Setup Token is regenerated and reconnected", async () => {
    await setup();
    const { householdId: hh } = await insertHousehold(db);

    const firstDiscovered = await claimAndDiscoverAccountsDirect(SIMPLEFIN_TEST_SETUP_TOKEN, hh, db);
    if (!firstDiscovered.success) throw new Error("expected success");
    const first = firstDiscovered.connections[0];

    const firstConfirm = await confirmSimplefinAccountsDirect(
      [{ connectionId: first.connectionId, accounts: first.accounts.map((a) => ({ ...a, type: "checking" as const })) }],
      hh,
      db,
    );
    expect(firstConfirm.success).toBe(true);

    // User goes back to their SimpleFIN Bridge, regenerates a new Setup
    // Token for the same institution, and reconnects via the same flow.
    const secondDiscovered = await claimAndDiscoverAccountsDirect(SIMPLEFIN_TEST_SETUP_TOKEN, hh, db);
    if (!secondDiscovered.success) throw new Error("expected success");
    const second = secondDiscovered.connections[0];

    // No second bank_connections row for this institution — the existing
    // one is reused and put back into pending_classification.
    expect(second.connectionId).toBe(first.connectionId);
    expect(second.accounts[0].existingType).toBe("checking");

    const midwayConnections = await db.select().from(bankConnections).where(eq(bankConnections.householdId, hh));
    expect(midwayConnections).toHaveLength(1);
    expect(midwayConnections[0].status).toBe("pending_classification");

    const secondConfirm = await confirmSimplefinAccountsDirect(
      [{ connectionId: second.connectionId, accounts: second.accounts.map((a) => ({ ...a, type: a.existingType ?? "checking" })) }],
      hh,
      db,
    );
    expect(secondConfirm.success).toBe(true);

    const finalConnections = await db.select().from(bankConnections).where(eq(bankConnections.householdId, hh));
    expect(finalConnections).toHaveLength(1);
    expect(finalConnections[0].status).toBe("active");

    const accts = await db.select().from(accounts).where(eq(accounts.householdId, hh));
    expect(accts).toHaveLength(1);
    expect(accts[0].externalAccountId).toBe("sf-acc-checking");
  });

  it("isolates draft connections between households", async () => {
    await setup();
    const { householdId: hhA } = await insertHousehold(db);
    const { householdId: hhB } = await insertHousehold(db);

    const discovered = await claimAndDiscoverAccountsDirect(SIMPLEFIN_TEST_SETUP_TOKEN, hhA, db);
    if (!discovered.success) throw new Error("expected success");
    const { connectionId, accounts: discoveredAccounts } = discovered.connections[0];

    const result = await confirmSimplefinAccountsDirect(
      [{ connectionId, accounts: discoveredAccounts.map((a) => ({ ...a, type: "checking" as const })) }],
      hhB,
      db,
    );
    expect(result.success).toBe(false);
  });
});
