import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb } from "../../../tests/integration/setup";
import type { LedgrDb } from "@/db";
import { households } from "@/db/schema";
import { plaidItems } from "@/db/schema/plaid";
import { DEMO_HOUSEHOLD_ID } from "@/lib/demo-mode";
import { listActivePlaidItems } from "./queries";

describe("listActivePlaidItems", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });
  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await db.delete(plaidItems);
    await db.delete(households);
    await db.insert(households).values([
      { id: "hh-1", name: "H1" },
      { id: "hh-2", name: "H2" },
      { id: DEMO_HOUSEHOLD_ID, name: "Demo" },
    ]);
  });

  it("returns active items across households, sorted deterministically", async () => {
    await db.insert(plaidItems).values([
      { id: "it-1", householdId: "hh-1", accessToken: "t1", status: "active" },
      { id: "it-2", householdId: "hh-2", accessToken: "t2", status: "active" },
    ]);

    const result = await listActivePlaidItems(db);

    expect(result).toEqual([
      { itemId: "it-1", householdId: "hh-1" },
      { itemId: "it-2", householdId: "hh-2" },
    ]);
  });

  it("excludes the demo household", async () => {
    await db.insert(plaidItems).values([
      { id: "it-demo", householdId: DEMO_HOUSEHOLD_ID, accessToken: "t", status: "active" },
      { id: "it-real", householdId: "hh-1", accessToken: "t", status: "active" },
    ]);

    const result = await listActivePlaidItems(db);

    expect(result.map((i) => i.itemId)).toEqual(["it-real"]);
  });

  it("excludes items with terminal statuses", async () => {
    await db.insert(plaidItems).values([
      { id: "it-active", householdId: "hh-1", accessToken: "t", status: "active" },
      { id: "it-reauth", householdId: "hh-1", accessToken: "t", status: "reauth_required" },
      { id: "it-revoked", householdId: "hh-1", accessToken: "t", status: "revoked" },
      { id: "it-error", householdId: "hh-1", accessToken: "t", status: "error" },
    ]);

    const result = await listActivePlaidItems(db);

    expect(result.map((i) => i.itemId)).toEqual(["it-active"]);
  });
});
