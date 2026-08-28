import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../../tests/integration/setup";
import type { LedgrDb } from "@/db";
import { households } from "@/db/schema";
import { bankConnections } from "@/db/schema/bank-connections";
import { DEMO_HOUSEHOLD_ID } from "@/lib/demo-mode";
import { listActiveSimplefinConnections, cleanupStaleDraftConnections } from "./queries";

describe("listActiveSimplefinConnections", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });
  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await db.delete(bankConnections);
    await db.delete(households);
    await db.insert(households).values([
      { id: "hh-1", name: "H1" },
      { id: "hh-2", name: "H2" },
      { id: DEMO_HOUSEHOLD_ID, name: "Demo" },
    ]);
  });

  it("returns active connections across households, sorted deterministically", async () => {
    await db.insert(bankConnections).values([
      { id: "conn-1", householdId: "hh-1", provider: "simplefin", credential: "t1", status: "active" },
      { id: "conn-2", householdId: "hh-2", provider: "simplefin", credential: "t2", status: "active" },
    ]);

    const result = await listActiveSimplefinConnections(db);

    expect(result).toEqual([
      { connectionId: "conn-1", householdId: "hh-1" },
      { connectionId: "conn-2", householdId: "hh-2" },
    ]);
  });

  it("excludes the demo household", async () => {
    await db.insert(bankConnections).values([
      { id: "conn-demo", householdId: DEMO_HOUSEHOLD_ID, provider: "simplefin", credential: "t", status: "active" },
      { id: "conn-real", householdId: "hh-1", provider: "simplefin", credential: "t", status: "active" },
    ]);

    const result = await listActiveSimplefinConnections(db);

    expect(result.map((c) => c.connectionId)).toEqual(["conn-real"]);
  });

  it("excludes connections with terminal or pending statuses", async () => {
    await db.insert(bankConnections).values([
      { id: "conn-active", householdId: "hh-1", provider: "simplefin", credential: "t", status: "active" },
      { id: "conn-revoked", householdId: "hh-1", provider: "simplefin", credential: "t", status: "revoked" },
      { id: "conn-error", householdId: "hh-1", provider: "simplefin", credential: "t", status: "error" },
      { id: "conn-pending", householdId: "hh-1", provider: "simplefin", credential: "t", status: "pending_classification" },
    ]);

    const result = await listActiveSimplefinConnections(db);

    expect(result.map((c) => c.connectionId)).toEqual(["conn-active"]);
  });

  it("excludes non-simplefin connections", async () => {
    await db.insert(bankConnections).values([
      { id: "conn-plaid", householdId: "hh-1", provider: "plaid", credential: "t", status: "active" },
      { id: "conn-simplefin", householdId: "hh-1", provider: "simplefin", credential: "t", status: "active" },
    ]);

    const result = await listActiveSimplefinConnections(db);

    expect(result.map((c) => c.connectionId)).toEqual(["conn-simplefin"]);
  });
});

describe("cleanupStaleDraftConnections", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });
  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await db.delete(bankConnections);
    await db.delete(households);
    await db.insert(households).values([{ id: "hh-1", name: "H1" }]);
  });

  it("deletes pending_classification drafts older than the TTL", async () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await db.insert(bankConnections).values({
      id: "conn-stale",
      householdId: "hh-1",
      provider: "simplefin",
      credential: "t",
      status: "pending_classification",
      createdAt: old,
      updatedAt: old,
    });

    const deleted = await cleanupStaleDraftConnections(db, 24 * 60 * 60 * 1000);
    expect(deleted).toBe(1);

    const rows = await db.select().from(bankConnections).where(eq(bankConnections.id, "conn-stale"));
    expect(rows).toHaveLength(0);
  });

  it("does not delete a recent pending_classification draft", async () => {
    await db.insert(bankConnections).values({
      id: "conn-fresh",
      householdId: "hh-1",
      provider: "simplefin",
      credential: "t",
      status: "pending_classification",
    });

    const deleted = await cleanupStaleDraftConnections(db, 24 * 60 * 60 * 1000);
    expect(deleted).toBe(0);

    const rows = await db.select().from(bankConnections).where(eq(bankConnections.id, "conn-fresh"));
    expect(rows).toHaveLength(1);
  });

  it("does not delete an old connection that is already active", async () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await db.insert(bankConnections).values({
      id: "conn-active",
      householdId: "hh-1",
      provider: "simplefin",
      credential: "t",
      status: "active",
      createdAt: old,
      updatedAt: old,
    });

    const deleted = await cleanupStaleDraftConnections(db, 24 * 60 * 60 * 1000);
    expect(deleted).toBe(0);

    const rows = await db.select().from(bankConnections).where(eq(bankConnections.id, "conn-active"));
    expect(rows).toHaveLength(1);
  });
});
