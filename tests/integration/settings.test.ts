import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "./setup";
import type { LedgrDb } from "@/db";
import { userSettings } from "@/db/schema";
import { v4 as uuid } from "uuid";
import { getUserAiSettings } from "@/queries/settings";
import { upsertAiSettings } from "@/actions/settings";

describe("settings queries", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;
  const userId = "user-1";

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
  });

  afterEach(async () => {
    await close();
  });

  test("returns null when no settings exist", async () => {
    const result = await getUserAiSettings(userId, db);
    expect(result).toBeNull();
  });

  test("returns settings with hasKey flag", async () => {
    await db.insert(userSettings).values({
      id: uuid(),
      userId,
      aiProvider: "openai",
      aiModel: "gpt-4.1",
      aiApiKey: "encrypted-value",
    });

    const result = await getUserAiSettings(userId, db);
    expect(result).not.toBeNull();
    expect(result!.aiProvider).toBe("openai");
    expect(result!.aiModel).toBe("gpt-4.1");
    expect(result!.hasKey).toBe(true);
    expect(result!.rawEncryptedKey).toBe("encrypted-value");
  });

  test("upserts settings — insert then update", async () => {
    await upsertAiSettings(userId, {
      aiProvider: "openai",
      aiModel: "gpt-4.1",
      aiApiKey: "encrypted-key-1",
    }, db);

    let result = await getUserAiSettings(userId, db);
    expect(result!.aiProvider).toBe("openai");

    await upsertAiSettings(userId, {
      aiProvider: "anthropic",
      aiModel: "claude-sonnet-4-20250514",
    }, db);

    result = await getUserAiSettings(userId, db);
    expect(result!.aiProvider).toBe("anthropic");
    expect(result!.hasKey).toBe(true);
  });

  test("upserts with custom provider and base URL", async () => {
    await upsertAiSettings(userId, {
      aiProvider: "custom",
      aiModel: "llama3.1:8b",
      aiBaseUrl: "http://localhost:11434/v1",
    }, db);

    const result = await getUserAiSettings(userId, db);
    expect(result!.aiProvider).toBe("custom");
    expect(result!.aiBaseUrl).toBe("http://localhost:11434/v1");
  });
});
