import { describe, test, expect } from "vitest";
import { createTestDb } from "./setup";
import { v4 as uuid } from "uuid";
import { userSettings, households, householdMembers } from "@/db/schema";
import { isDemoMode, guardDemoMode, DEMO_HOUSEHOLD_ID } from "@/lib/demo-mode";
import { resolveHouseholdId } from "@/lib/auth/session";
import { seedDemoHousehold } from "@/db/seed/demo";

// AES-256 requires a 32-byte key; provide it as 64 hex chars
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY ||
  "0000000000000000000000000000000000000000000000000000000000000000";

describe("demo mode integration", () => {
  test("seedDemoHousehold is idempotent", () => {
    const { db } = createTestDb();
    seedDemoHousehold(db);
    seedDemoHousehold(db); // second call should not throw
    const count = db
      .select()
      .from(households)
      .all();
    expect(count.filter((h) => h.id === DEMO_HOUSEHOLD_ID)).toHaveLength(1);
  });

  test("isDemoMode returns true after enabling", () => {
    const { db } = createTestDb();
    const userId = uuid();
    db.insert(userSettings).values({ id: uuid(), userId, demoMode: true }).run();
    expect(isDemoMode(userId, db)).toBe(true);
  });

  test("guardDemoMode blocks writes when demo mode is on", () => {
    const { db } = createTestDb();
    const userId = uuid();
    db.insert(userSettings).values({ id: uuid(), userId, demoMode: true }).run();
    const result = guardDemoMode(userId, db);
    expect(result).not.toBeNull();
    expect(result!.error).toContain("read-only");
  });

  test("resolveHouseholdId does not return demo household for normal user", () => {
    const { db } = createTestDb();
    const userId = uuid();
    const householdId = uuid();
    db.insert(households).values({ id: householdId, name: "Real" }).run();
    db.insert(householdMembers).values({ id: uuid(), householdId, userId, role: "owner" }).run();
    expect(resolveHouseholdId(userId, db)).toBe(householdId);
  });
});
