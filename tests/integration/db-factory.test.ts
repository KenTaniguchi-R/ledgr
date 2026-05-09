import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "./setup";
import { households } from "../../src/db/schema";

describe("createTestDb", () => {
  let close: () => void;

  afterEach(() => {
    close?.();
  });

  it("creates a working in-memory database with schema", () => {
    const testDb = createTestDb();
    close = testDb.close;

    testDb.db
      .insert(households)
      .values({
        id: "hh-1",
        name: "Test Household",
      })
      .run();

    const result = testDb.db.select().from(households).all();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Test Household");
  });

  it("provides isolated instances (no shared state)", () => {
    const db1 = createTestDb();
    const db2 = createTestDb();

    db1.db
      .insert(households)
      .values({ id: "hh-1", name: "Household A" })
      .run();

    const result = db2.db.select().from(households).all();
    expect(result).toHaveLength(0);

    db1.close();
    db2.close();
  });
});
