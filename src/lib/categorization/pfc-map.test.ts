import { describe, it, expect } from "vitest";
import { test } from "@fast-check/vitest";
import * as fc from "fast-check";
import { PFC_DETAILED_TO_CATEGORY } from "./pfc-map";
import { DEFAULT_CATEGORIES } from "@/db/seed/categories";

const ALL_SEED_NAMES = DEFAULT_CATEGORIES.flatMap((g) =>
  g.categories.map((c) => c.name),
);

function pfcToCategoryName(pfcDetailed: string): string | null {
  return PFC_DETAILED_TO_CATEGORY[pfcDetailed] ?? null;
}

describe("PFC_DETAILED_TO_CATEGORY", () => {
  test.prop([fc.constantFrom(...Object.keys(PFC_DETAILED_TO_CATEGORY))])(
    "every mapped PFC code resolves to a known seed category name",
    (pfcCode) => {
      const name = pfcToCategoryName(pfcCode);
      expect(ALL_SEED_NAMES).toContain(name);
    },
  );

  it("returns null for unknown PFC codes", () => {
    expect(pfcToCategoryName("TOTALLY_UNKNOWN_CODE")).toBeNull();
    expect(pfcToCategoryName("")).toBeNull();
  });

  it("covers at least 60 PFC codes", () => {
    const count = Object.keys(PFC_DETAILED_TO_CATEGORY).length;
    expect(count).toBeGreaterThanOrEqual(60);
  });
});
