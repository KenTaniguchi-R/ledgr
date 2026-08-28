import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./setup";
import { server } from "../mocks/server";
import { accounts, bankConnections } from "@/db/schema";
import { disconnectSimplefinConnectionDirect } from "@/actions/simplefin";
import { insertHousehold, insertSimplefinConnection, insertAccount } from "./helpers";
import type { LedgrDb } from "@/db";

beforeAll(() => {
  vi.stubEnv("ENCRYPTION_KEY", "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2");
  // No SimpleFIN handlers should be hit — disconnect has no revoke API call.
  server.listen({ onUnhandledRequest: "error" });
});
afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

describe("disconnectSimplefinConnection", () => {
  let db: LedgrDb;
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    server.resetHandlers();
    await close?.();
    close = undefined;
  });

  it("soft-deletes accounts and hard-deletes the bank_connections row, with no remote revoke call", async () => {
    ({ db, close } = await createTestDb());
    const { householdId } = await insertHousehold(db);
    const { connectionId } = await insertSimplefinConnection(db, householdId);
    await insertAccount(db, householdId, {
      bankConnectionId: connectionId,
      externalAccountId: "sf-acc-checking",
    });
    await insertAccount(db, householdId, {
      bankConnectionId: connectionId,
      externalAccountId: "sf-acc-savings",
    });

    const result = await disconnectSimplefinConnectionDirect(connectionId, householdId, db);
    expect("success" in result && result.success).toBe(true);
    expect("note" in result && result.note).toContain("SimpleFIN Bridge");

    const accts = await db.select().from(accounts).where(eq(accounts.householdId, householdId));
    expect(accts).toHaveLength(2);
    for (const acct of accts) {
      expect(acct.deletedAt).not.toBeNull();
      expect(acct.bankConnectionId).toBeNull();
    }

    const connections = await db.select().from(bankConnections).where(eq(bankConnections.id, connectionId));
    expect(connections).toHaveLength(0);
  });

  it("returns an error for a connection that doesn't belong to the household", async () => {
    ({ db, close } = await createTestDb());
    const { householdId: hhA } = await insertHousehold(db);
    const { householdId: hhB } = await insertHousehold(db);
    const { connectionId } = await insertSimplefinConnection(db, hhA);

    const result = await disconnectSimplefinConnectionDirect(connectionId, hhB, db);
    expect("error" in result).toBe(true);

    const connections = await db.select().from(bankConnections).where(eq(bankConnections.id, connectionId));
    expect(connections).toHaveLength(1);
  });
});
