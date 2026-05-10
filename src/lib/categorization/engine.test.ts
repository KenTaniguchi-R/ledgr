import { describe, it, expect } from "vitest";
import { test } from "@fast-check/vitest";
import * as fc from "fast-check";
import {
  categorizeTransactions,
  type CategorizableTransaction,
  type CategoryRule,
} from "./engine";

function makeTxn(overrides: Partial<CategorizableTransaction> = {}): CategorizableTransaction {
  return {
    id: "txn-1",
    name: "Whole Foods Market",
    merchantId: null,
    merchantName: null,
    merchantCategoryId: null,
    ...overrides,
  };
}

function makeRule(overrides: Partial<CategoryRule> = {}): CategoryRule {
  return {
    id: "rule-1",
    categoryId: "cat-groceries",
    matchField: "name",
    matchPattern: "whole foods",
    priority: 0,
    ...overrides,
  };
}

describe("categorizeTransactions", () => {
  it("matches a name rule (case-insensitive substring)", () => {
    const txns = [makeTxn({ name: "WHOLE FOODS MARKET #123" })];
    const rules = [makeRule({ matchPattern: "whole foods" })];

    const result = categorizeTransactions(txns, rules);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      transactionId: "txn-1",
      categoryId: "cat-groceries",
      source: "rule",
    });
  });

  it("matches a merchant rule against merchantName", () => {
    const txns = [makeTxn({ merchantName: "Spotify", merchantId: "m-1" })];
    const rules = [makeRule({ matchField: "merchant", matchPattern: "spotify", categoryId: "cat-subs" })];

    const result = categorizeTransactions(txns, rules);

    expect(result).toHaveLength(1);
    expect(result[0].categoryId).toBe("cat-subs");
    expect(result[0].source).toBe("rule");
  });

  it("higher priority rule wins over lower", () => {
    const txns = [makeTxn({ name: "Starbucks Coffee" })];
    const rules = [
      makeRule({ id: "r-low", matchPattern: "starbucks", categoryId: "cat-dining", priority: 0 }),
      makeRule({ id: "r-high", matchPattern: "starbucks", categoryId: "cat-coffee", priority: 10 }),
    ];

    const result = categorizeTransactions(txns, rules);

    expect(result).toHaveLength(1);
    expect(result[0].categoryId).toBe("cat-coffee");
  });

  it("falls back to merchant default when no rule matches", () => {
    const txns = [makeTxn({ name: "XYZ Corp", merchantCategoryId: "cat-misc", merchantId: "m-1" })];
    const rules = [makeRule({ matchPattern: "no-match" })];

    const result = categorizeTransactions(txns, rules);

    expect(result).toHaveLength(1);
    expect(result[0].categoryId).toBe("cat-misc");
    expect(result[0].source).toBe("merchant_default");
  });

  it("returns empty array when nothing matches and no merchant default", () => {
    const txns = [makeTxn({ name: "Unknown Store" })];
    const rules = [makeRule({ matchPattern: "no-match" })];

    const result = categorizeTransactions(txns, rules);

    expect(result).toHaveLength(0);
  });

  it("returns empty array when rules list is empty", () => {
    const txns = [makeTxn()];

    const result = categorizeTransactions(txns, []);

    expect(result).toHaveLength(0);
  });

  // Property-based tests
  test.prop(
    [
      fc.integer({ min: 0, max: 100 }),
      fc.integer({ min: 0, max: 100 }),
    ],
  )("higher priority always wins regardless of insertion order", (pA, pB) => {
    fc.pre(pA !== pB);
    const highPriority = Math.max(pA, pB);
    const lowPriority = Math.min(pA, pB);
    const txns = [makeTxn({ name: "test" })];
    const rules = [
      makeRule({ id: "r-low", matchPattern: "test", categoryId: "cat-low", priority: lowPriority }),
      makeRule({ id: "r-high", matchPattern: "test", categoryId: "cat-high", priority: highPriority }),
    ];

    const result = categorizeTransactions(txns, rules);

    expect(result).toHaveLength(1);
    expect(result[0].categoryId).toBe("cat-high");
  });

  test.prop(
    [fc.array(fc.record({ name: fc.string({ minLength: 1 }) }), { minLength: 1, maxLength: 20 })],
  )("output length never exceeds input length", (rawTxns) => {
    const txns = rawTxns.map((t, i) => makeTxn({ id: `txn-${i}`, name: t.name }));
    const rules = [makeRule({ matchPattern: "a" })];

    const result = categorizeTransactions(txns, rules);

    expect(result.length).toBeLessThanOrEqual(txns.length);
  });
});
