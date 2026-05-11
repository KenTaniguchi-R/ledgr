import { describe, test, expect } from "vitest";
import { createTestDb } from "../../tests/integration/setup";
import { userSettings } from "@/db/schema";
import { v4 as uuid } from "uuid";
import { isDemoMode, guardDemoMode, DEMO_HOUSEHOLD_ID } from "./demo-mode";

describe("isDemoMode", () => {
  test("returns false when user has no settings row", async () => {
    const { db, close } = await createTestDb();
    try {
      expect(await isDemoMode("nonexistent-user", db)).toBe(false);
    } finally {
      await close();
    }
  });

  test("returns false when demoMode is false", async () => {
    const { db, close } = await createTestDb();
    try {
      await db.insert(userSettings).values({ id: uuid(), userId: "user-1", demoMode: false });
      expect(await isDemoMode("user-1", db)).toBe(false);
    } finally {
      await close();
    }
  });

  test("returns true when demoMode is true", async () => {
    const { db, close } = await createTestDb();
    try {
      await db.insert(userSettings).values({ id: uuid(), userId: "user-1", demoMode: true });
      expect(await isDemoMode("user-1", db)).toBe(true);
    } finally {
      await close();
    }
  });
});

describe("guardDemoMode", () => {
  test("returns null when user is not in demo mode", async () => {
    const { db, close } = await createTestDb();
    try {
      await db.insert(userSettings).values({ id: uuid(), userId: "user-1", demoMode: false });
      expect(await guardDemoMode("user-1", db)).toBeNull();
    } finally {
      await close();
    }
  });

  test("returns error object when user is in demo mode", async () => {
    const { db, close } = await createTestDb();
    try {
      await db.insert(userSettings).values({ id: uuid(), userId: "user-1", demoMode: true });
      const result = await guardDemoMode("user-1", db);
      expect(result).toEqual({ error: expect.stringContaining("read-only") });
    } finally {
      await close();
    }
  });
});

describe("DEMO_HOUSEHOLD_ID", () => {
  test("is a fixed UUID", () => {
    expect(DEMO_HOUSEHOLD_ID).toBe("00000000-0000-0000-0000-000000000000");
  });
});
