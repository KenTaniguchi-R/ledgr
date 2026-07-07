import { describe, test, expect } from "vitest";
import { generateDedupHash } from "./dedup";

describe("generateDedupHash", () => {
  test("is stable for identical input", () => {
    const row = { date: "2026-07-07", amount: 1250, description: "Coffee" };
    expect(generateDedupHash(row)).toBe(generateDedupHash(row));
  });

  test("returns a 16-char hex slice", () => {
    const hash = generateDedupHash({ date: "2026-07-07", amount: 1250, description: "Coffee" });
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  test("is case-insensitive and whitespace-insensitive on description", () => {
    const a = generateDedupHash({ date: "2026-07-07", amount: 1250, description: "  COFFEE  " });
    const b = generateDedupHash({ date: "2026-07-07", amount: 1250, description: "coffee" });
    expect(a).toBe(b);
  });

  test("differs when any of date, amount, or description changes", () => {
    const base = generateDedupHash({ date: "2026-07-07", amount: 1250, description: "Coffee" });
    expect(generateDedupHash({ date: "2026-07-08", amount: 1250, description: "Coffee" })).not.toBe(base);
    expect(generateDedupHash({ date: "2026-07-07", amount: 1251, description: "Coffee" })).not.toBe(base);
    expect(generateDedupHash({ date: "2026-07-07", amount: 1250, description: "Tea" })).not.toBe(base);
  });
});
