import { describe, it, expect } from "vitest";
import { parseToCents, centsToInputDisplay } from "@/lib/money";

describe("currency conversion roundtrip", () => {
  it("converts cents to display and back", () => {
    expect(centsToInputDisplay(1250)).toBe("12.50");
    expect(parseToCents("12.50")).toBe(1250);
  });

  it("handles dollar sign and commas", () => {
    expect(parseToCents("$1,234.56")).toBe(123456);
  });

  it("handles whole dollar amounts", () => {
    expect(parseToCents("50")).toBe(5000);
  });

  it("returns null for empty string", () => {
    expect(parseToCents("")).toBeNull();
  });

  it("returns null for non-numeric input", () => {
    expect(parseToCents("abc")).toBeNull();
  });

  it("handles zero", () => {
    expect(centsToInputDisplay(0)).toBe("0.00");
    expect(parseToCents("0")).toBe(0);
  });
});
