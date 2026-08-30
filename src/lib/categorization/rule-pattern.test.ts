import { describe, it, expect } from "vitest";
import { test, fc } from "@fast-check/vitest";
import { normalizeRulePattern, MAX_RULE_PATTERN_LENGTH } from "./rule-pattern";

describe("normalizeRulePattern", () => {
  it("trims surrounding whitespace", () => {
    // The engine does not trim, so a stored leading space would stop the
    // pattern matching anything the user expected.
    expect(normalizeRulePattern("  spotify  ")).toBe("spotify");
  });

  it("keeps a usable pattern unchanged", () => {
    expect(normalizeRulePattern("twitterapi")).toBe("twitterapi");
  });

  it("preserves inner whitespace", () => {
    expect(normalizeRulePattern("  blue bottle  ")).toBe("blue bottle");
  });

  it("rejects an empty pattern", () => {
    expect(normalizeRulePattern("")).toBeNull();
  });

  it("rejects a whitespace-only pattern", () => {
    // `"".includes()` is true for every string, so a blank rule would match the
    // entire feed — and as tier 1 it would outrank every other step.
    expect(normalizeRulePattern("   \t \n ")).toBeNull();
  });

  it("accepts a pattern exactly at the length limit", () => {
    const atLimit = "a".repeat(MAX_RULE_PATTERN_LENGTH);
    expect(normalizeRulePattern(atLimit)).toBe(atLimit);
  });

  it("rejects a pattern one character over the limit", () => {
    expect(normalizeRulePattern("a".repeat(MAX_RULE_PATTERN_LENGTH + 1))).toBeNull();
  });

  it("measures the limit after trimming, not before", () => {
    const padded = `  ${"a".repeat(MAX_RULE_PATTERN_LENGTH)}  `;
    expect(normalizeRulePattern(padded)).toBe("a".repeat(MAX_RULE_PATTERN_LENGTH));
  });

  test.prop([fc.string()])("never returns an empty or untrimmed string", (raw) => {
    const result = normalizeRulePattern(raw);
    if (result !== null) {
      expect(result.length).toBeGreaterThan(0);
      expect(result).toBe(result.trim());
      expect(result.length).toBeLessThanOrEqual(MAX_RULE_PATTERN_LENGTH);
    }
  });

  test.prop([fc.string()])(
    "accepts exactly when the trimmed input is usable",
    (raw) => {
      const trimmed = raw.trim();
      const usable = trimmed.length > 0 && trimmed.length <= MAX_RULE_PATTERN_LENGTH;
      expect(normalizeRulePattern(raw) !== null).toBe(usable);
    },
  );
});
