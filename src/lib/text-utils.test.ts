import { describe, test, expect } from "vitest";
import { titleCase, sanitizeMojibake } from "./text-utils";

describe("titleCase", () => {
  test("trims, lowercases, and capitalizes each word", () => {
    expect(titleCase("  WHOLE FOODS market  ")).toBe("Whole Foods Market");
    expect(titleCase("acme")).toBe("Acme");
  });

  test("capitalizes the first letter following non-word boundaries", () => {
    expect(titleCase("mcdonald's")).toBe("Mcdonald'S");
    expect(titleCase("at&t store")).toBe("At&T Store");
  });

  test("empty string stays empty", () => {
    expect(titleCase("")).toBe("");
  });
});

describe("sanitizeMojibake", () => {
  test("collapses a run of replacement characters into a single space", () => {
    expect(sanitizeMojibake("WELLS FARGO AUTOGRAPH VISA�� CARD ...2842")).toBe(
      "WELLS FARGO AUTOGRAPH VISA CARD ...2842",
    );
  });

  test("removes a single stray replacement character", () => {
    expect(sanitizeMojibake("Citi Custom Cash� Card")).toBe("Citi Custom Cash Card");
  });

  test("leaves clean names untouched", () => {
    expect(sanitizeMojibake("Checking-1135")).toBe("Checking-1135");
  });
});
