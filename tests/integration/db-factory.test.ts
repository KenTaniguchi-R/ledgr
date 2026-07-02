import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "./setup";
import { households } from "../../src/db/schema";

describe("createTestDb", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    // Null out after closing: the "isolated instances" test manages its own
    // cleanup and never reassigns `close`, so without this the stale (already
    // ended) pool from the previous test would be closed a second time.
    await close?.();
    close = undefined;
  });

  it("creates a working database with schema", async () => {
    const testDb = await createTestDb();
    close = testDb.close;

    await testDb.db.insert(households).values({
      id: "hh-1",
      name: "Test Household",
    });

    const result = await testDb.db.select().from(households);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Test Household");
  });

  it("provides isolated instances (no shared state)", async () => {
    const db1 = await createTestDb();
    const db2 = await createTestDb();

    await db1.db.insert(households).values({ id: "hh-1", name: "Household A" });

    const result = await db2.db.select().from(households);
    expect(result).toHaveLength(0);

    await db1.close();
    await db2.close();
  });
});
