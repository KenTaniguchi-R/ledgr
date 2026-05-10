import { describe, test, expect } from "vitest";
import { createUserModel } from "./provider";

describe("createUserModel", () => {
  test("creates OpenAI model", () => {
    const model = createUserModel({
      aiProvider: "openai",
      aiModel: "gpt-4.1",
      aiApiKey: "sk-test-key",
    });
    expect(model).toBeDefined();
    expect((model as { modelId: string }).modelId).toBe("gpt-4.1");
  });

  test("creates Anthropic model", () => {
    const model = createUserModel({
      aiProvider: "anthropic",
      aiModel: "claude-sonnet-4-20250514",
      aiApiKey: "sk-ant-test",
    });
    expect(model).toBeDefined();
    expect((model as { modelId: string }).modelId).toBe(
      "claude-sonnet-4-20250514",
    );
  });

  test("creates Google model", () => {
    const model = createUserModel({
      aiProvider: "google",
      aiModel: "gemini-2.5-flash",
      aiApiKey: "test-key",
    });
    expect(model).toBeDefined();
  });

  test("creates custom OpenAI-compatible model", () => {
    const model = createUserModel({
      aiProvider: "custom",
      aiModel: "llama3.1:8b",
      aiApiKey: "",
      aiBaseUrl: "http://localhost:11434/v1",
    });
    expect(model).toBeDefined();
  });

  test("throws on custom provider without baseUrl", () => {
    expect(() =>
      createUserModel({
        aiProvider: "custom",
        aiModel: "llama3.1:8b",
        aiApiKey: "",
      }),
    ).toThrow("aiBaseUrl is required");
  });
});
