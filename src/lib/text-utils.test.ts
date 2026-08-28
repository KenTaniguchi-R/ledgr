import { describe, test, expect } from "vitest";
import { titleCase } from "./text-utils";

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
