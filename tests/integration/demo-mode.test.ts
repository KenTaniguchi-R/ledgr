import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "./setup";
import { v4 as uuid } from "uuid";
import { userSettings, households, householdMembers } from "@/db/schema";
import { isDemoMode, guardDemoMode, DEMO_HOUSEHOLD_ID } from "@/lib/demo-mode";
import { resolveHouseholdId } from "@/lib/auth/session";
import { seedDemoHousehold } from "@/db/seed/demo";
import type { LedgrDb } from "@/db";

process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY ||
  "0000000000000000000000000000000000000000000000000000000000000000";

describe("demo mode integration", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  test("seedDemoHousehold is idempotent", async () => {
    const { db: db2, close: close2 } = await createTestDb();
    try {
      await seedDemoHousehold(db2);
      await seedDemoHousehold(db2);
      const count = await db2.select().from(households);
      expect(count.filter((h) => h.id === DEMO_HOUSEHOLD_ID)).toHaveLength(1);
    } finally {
      await close2();
    }
  });

  test("isDemoMode returns true after enabling", async () => {
    const userId = uuid();
    await db.insert(userSettings).values({ id: uuid(), userId, demoMode: true });
    expect(await isDemoMode(userId, db)).toBe(true);
  });

  test("guardDemoMode blocks writes when demo mode is on", async () => {
    const userId = uuid();
    await db.insert(userSettings).values({ id: uuid(), userId, demoMode: true });
    const result = await guardDemoMode(userId, db);
    expect(result).not.toBeNull();
    expect(result!.error).toContain("read-only");
  });

  test("resolveHouseholdId does not return demo household for normal user", async () => {
    const userId = uuid();
    const householdId = uuid();
    await db.insert(households).values({ id: householdId, name: "Real" });
    await db.insert(householdMembers).values({ id: uuid(), householdId, userId, role: "owner" });
    expect(await resolveHouseholdId(userId, db)).toBe(householdId);
  });
});
