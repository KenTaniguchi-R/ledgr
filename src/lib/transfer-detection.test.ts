import { describe, it, expect } from "vitest";
import { test } from "@fast-check/vitest";
import * as fc from "fast-check";
import { detectTransferPairs, type TransferCandidate } from "./transfer-detection";

function candidate(overrides: Partial<TransferCandidate> = {}): TransferCandidate {
  return {
    id: "txn-1",
    accountId: "acct-a",
    date: "2026-05-10",
    normalizedAmount: -1000,
    ...overrides,
  };
}

describe("detectTransferPairs", () => {
  it("pairs an exact-amount outflow and inflow across two accounts within the window", () => {
    const outflow = candidate({ id: "out-1", accountId: "acct-a", date: "2026-05-10", normalizedAmount: -5000 });
    const inflow = candidate({ id: "in-1", accountId: "acct-b", date: "2026-05-11", normalizedAmount: 5000 });

    const pairs = detectTransferPairs([outflow, inflow]);

    expect(pairs).toEqual([{ outflowId: "out-1", inflowId: "in-1" }]);
  });

  it("does not pair transactions in the same account", () => {
    const outflow = candidate({ id: "out-1", accountId: "acct-a", date: "2026-05-10", normalizedAmount: -5000 });
    const inflow = candidate({ id: "in-1", accountId: "acct-a", date: "2026-05-10", normalizedAmount: 5000 });

    expect(detectTransferPairs([outflow, inflow])).toEqual([]);
  });

  it("does not pair when amounts differ", () => {
    const outflow = candidate({ id: "out-1", accountId: "acct-a", date: "2026-05-10", normalizedAmount: -5000 });
    const inflow = candidate({ id: "in-1", accountId: "acct-b", date: "2026-05-10", normalizedAmount: 4999 });

    expect(detectTransferPairs([outflow, inflow])).toEqual([]);
  });

  it("does not pair when the date gap exceeds the window", () => {
    const outflow = candidate({ id: "out-1", accountId: "acct-a", date: "2026-05-01", normalizedAmount: -5000 });
    const inflow = candidate({ id: "in-1", accountId: "acct-b", date: "2026-05-10", normalizedAmount: 5000 });

    expect(detectTransferPairs([outflow, inflow], 3)).toEqual([]);
  });

  it("pairs exactly at the edge of the date window", () => {
    const outflow = candidate({ id: "out-1", accountId: "acct-a", date: "2026-05-01", normalizedAmount: -5000 });
    const inflow = candidate({ id: "in-1", accountId: "acct-b", date: "2026-05-04", normalizedAmount: 5000 });

    expect(detectTransferPairs([outflow, inflow], 3)).toEqual([{ outflowId: "out-1", inflowId: "in-1" }]);
  });

  it("leaves an outflow unpaired when it has two equally-good inflow candidates", () => {
    const outflow = candidate({ id: "out-1", accountId: "acct-a", date: "2026-05-10", normalizedAmount: -5000 });
    const inflow1 = candidate({ id: "in-1", accountId: "acct-b", date: "2026-05-10", normalizedAmount: 5000 });
    const inflow2 = candidate({ id: "in-2", accountId: "acct-c", date: "2026-05-11", normalizedAmount: 5000 });

    expect(detectTransferPairs([outflow, inflow1, inflow2])).toEqual([]);
  });

  it("leaves an inflow unpaired when it has two equally-good outflow candidates", () => {
    const inflow = candidate({ id: "in-1", accountId: "acct-a", date: "2026-05-10", normalizedAmount: 5000 });
    const outflow1 = candidate({ id: "out-1", accountId: "acct-b", date: "2026-05-10", normalizedAmount: -5000 });
    const outflow2 = candidate({ id: "out-2", accountId: "acct-c", date: "2026-05-11", normalizedAmount: -5000 });

    expect(detectTransferPairs([inflow, outflow1, outflow2])).toEqual([]);
  });

  it("ignores zero-amount transactions", () => {
    const zero = candidate({ id: "zero-1", accountId: "acct-a", normalizedAmount: 0 });
    expect(detectTransferPairs([zero])).toEqual([]);
  });

  it("pairs correctly among multiple unrelated candidates", () => {
    const pairAOut = candidate({ id: "out-a", accountId: "acct-a", date: "2026-05-10", normalizedAmount: -5000 });
    const pairAIn = candidate({ id: "in-a", accountId: "acct-b", date: "2026-05-10", normalizedAmount: 5000 });
    const pairBOut = candidate({ id: "out-b", accountId: "acct-c", date: "2026-06-01", normalizedAmount: -1500 });
    const pairBIn = candidate({ id: "in-b", accountId: "acct-d", date: "2026-06-02", normalizedAmount: 1500 });
    const unrelatedExpense = candidate({ id: "expense-1", accountId: "acct-a", date: "2026-05-15", normalizedAmount: -300 });

    const pairs = detectTransferPairs([pairAOut, pairAIn, pairBOut, pairBIn, unrelatedExpense]);

    expect(pairs).toHaveLength(2);
    expect(pairs).toEqual(
      expect.arrayContaining([
        { outflowId: "out-a", inflowId: "in-a" },
        { outflowId: "out-b", inflowId: "in-b" },
      ]),
    );
  });

  test.prop([
    fc.array(
      fc.record({
        id: fc.uuid(),
        accountId: fc.constantFrom("acct-a", "acct-b", "acct-c"),
        date: fc.constantFrom("2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04"),
        normalizedAmount: fc.integer({ min: -10000, max: 10000 }),
      }),
      { minLength: 0, maxLength: 15 },
    ),
  ])("never uses the same transaction id in more than one pair", (candidates) => {
    const pairs = detectTransferPairs(candidates as TransferCandidate[]);
    const seen = new Set<string>();
    for (const pair of pairs) {
      expect(seen.has(pair.outflowId)).toBe(false);
      expect(seen.has(pair.inflowId)).toBe(false);
      seen.add(pair.outflowId);
      seen.add(pair.inflowId);
    }
  });
});
