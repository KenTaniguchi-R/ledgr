import { describe, test, expect } from "vitest";
import { classifyAccountType, ASSET_TYPES, LIABILITY_TYPES } from "./account-utils";

describe("classifyAccountType", () => {
  test("liability types classify as liability", () => {
    for (const type of LIABILITY_TYPES) {
      expect(classifyAccountType(type)).toBe("liability");
    }
  });

  test("asset types classify as asset", () => {
    for (const type of ASSET_TYPES) {
      expect(classifyAccountType(type)).toBe("asset");
    }
  });

  test("unknown types default to asset", () => {
    expect(classifyAccountType("mystery")).toBe("asset");
    expect(classifyAccountType("")).toBe("asset");
  });

  test("asset and liability type sets are disjoint", () => {
    for (const type of ASSET_TYPES) {
      expect(LIABILITY_TYPES.has(type)).toBe(false);
    }
  });
});
