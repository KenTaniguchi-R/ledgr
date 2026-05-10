import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "./setup";
import type { LedgrDb } from "@/db";
import { userSettings } from "@/db/schema";
import { v4 as uuid } from "uuid";
import { getUserAiSettings, upsertAiSettings } from "@/queries/settings";

describe("settings queries", () => {
  let db: LedgrDb;
  let close: () => void;
  const userId = "user-1";

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    close = testDb.close;
  });

  afterEach(() => {
    close();
  });

  test("returns null when no settings exist", () => {
    const result = getUserAiSettings(userId, db);
    expect(result).toBeNull();
  });

  test("returns settings with hasKey flag", () => {
    db.insert(userSettings).values({
      id: uuid(),
      userId,
      aiProvider: "openai",
      aiModel: "gpt-4.1",
      aiApiKey: "encrypted-value",
    }).run();

    const result = getUserAiSettings(userId, db);
    expect(result).not.toBeNull();
    expect(result!.aiProvider).toBe("openai");
    expect(result!.aiModel).toBe("gpt-4.1");
    expect(result!.hasKey).toBe(true);
    expect(result!.rawEncryptedKey).toBe("encrypted-value");
  });

  test("upserts settings — insert then update", () => {
    upsertAiSettings(userId, {
      aiProvider: "openai",
      aiModel: "gpt-4.1",
      aiApiKey: "encrypted-key-1",
    }, db);

    let result = getUserAiSettings(userId, db);
    expect(result!.aiProvider).toBe("openai");

    upsertAiSettings(userId, {
      aiProvider: "anthropic",
      aiModel: "claude-sonnet-4-20250514",
    }, db);

    result = getUserAiSettings(userId, db);
    expect(result!.aiProvider).toBe("anthropic");
    // Key should be preserved from first insert (update didn't pass aiApiKey)
    expect(result!.hasKey).toBe(true);
  });

  test("upserts with custom provider and base URL", () => {
    upsertAiSettings(userId, {
      aiProvider: "custom",
      aiModel: "llama3.1:8b",
      aiBaseUrl: "http://localhost:11434/v1",
    }, db);

    const result = getUserAiSettings(userId, db);
    expect(result!.aiProvider).toBe("custom");
    expect(result!.aiBaseUrl).toBe("http://localhost:11434/v1");
  });
});
