import { describe, test, expect } from "vitest";
import type { UIMessage } from "ai";
import { toolPartLabel } from "./chat-message-part";

type Part = UIMessage["parts"][number];
const asPart = (p: unknown) => p as Part;

describe("toolPartLabel", () => {
  // Regression: AI SDK v7 streams statically-declared tools as `tool-<name>`,
  // not `dynamic-tool`. The old component matched only `dynamic-tool`, so every
  // financial tool's activity indicator was silently dropped.
  test("labels a running static tool part (tool-<name>)", () => {
    expect(
      toolPartLabel(
        asPart({
          type: "tool-getSpendingByCategory",
          toolCallId: "1",
          state: "input-available",
          input: {},
        }),
      ),
    ).toBe("Running: getSpendingByCategory...");
  });

  test("labels a completed static tool part", () => {
    expect(
      toolPartLabel(
        asPart({
          type: "tool-searchTransactions",
          toolCallId: "1",
          state: "output-available",
          input: {},
          output: {},
        }),
      ),
    ).toBe("Done: searchTransactions");
  });

  test("labels a running dynamic-tool part", () => {
    expect(
      toolPartLabel(
        asPart({
          type: "dynamic-tool",
          toolName: "custom",
          toolCallId: "1",
          state: "input-available",
          input: {},
        }),
      ),
    ).toBe("Running: custom...");
  });

  test("returns null for non-tool parts", () => {
    expect(toolPartLabel(asPart({ type: "text", text: "hi" }))).toBeNull();
  });
});
