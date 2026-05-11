import { describe, test, expect } from "vitest";
import { createTestDb } from "../../tests/integration/setup";
import { userSettings } from "@/db/schema";
import { v4 as uuid } from "uuid";
import { isDemoMode, guardDemoMode, DEMO_HOUSEHOLD_ID } from "./demo-mode";

describe("isDemoMode", () => {
  test("returns false when user has no settings row", () => {
    const { db } = createTestDb();
    expect(isDemoMode("nonexistent-user", db)).toBe(false);
  });

  test("returns false when demoMode is false", () => {
    const { db } = createTestDb();
    db.insert(userSettings).values({ id: uuid(), userId: "user-1", demoMode: false }).run();
    expect(isDemoMode("user-1", db)).toBe(false);
  });

  test("returns true when demoMode is true", () => {
    const { db } = createTestDb();
    db.insert(userSettings).values({ id: uuid(), userId: "user-1", demoMode: true }).run();
    expect(isDemoMode("user-1", db)).toBe(true);
  });
});

describe("guardDemoMode", () => {
  test("returns null when user is not in demo mode", () => {
    const { db } = createTestDb();
    db.insert(userSettings).values({ id: uuid(), userId: "user-1", demoMode: false }).run();
    expect(guardDemoMode("user-1", db)).toBeNull();
  });

  test("returns error object when user is in demo mode", () => {
    const { db } = createTestDb();
    db.insert(userSettings).values({ id: uuid(), userId: "user-1", demoMode: true }).run();
    const result = guardDemoMode("user-1", db);
    expect(result).toEqual({ error: expect.stringContaining("read-only") });
  });
});

describe("DEMO_HOUSEHOLD_ID", () => {
  test("is a fixed UUID", () => {
    expect(DEMO_HOUSEHOLD_ID).toBe("00000000-0000-0000-0000-000000000000");
  });
});
