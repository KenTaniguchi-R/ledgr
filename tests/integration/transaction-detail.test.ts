import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { test } from "@fast-check/vitest";
import * as fc from "fast-check";
import { v4 as uuid } from "uuid";
import { createTestDb } from "./setup";
import { getTransactionDetail } from "@/queries/transactions";
import type { LedgrDb } from "@/db";
import {
  households,
  accounts,
  transactions,
  transactionSplits,
  categoryGroups,
  categories,
} from "@/db/schema";
import { eq } from "drizzle-orm";

// Mock auth + revalidation
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let mockHouseholdId: string;
vi.mock("../../src/lib/auth/session", () => ({
  getHouseholdId: vi.fn(() => Promise.resolve(mockHouseholdId)),
}));

import {
  updateTransactionFields,
  upsertSplit,
  deleteSplit,
} from "@/actions/transaction-detail";

let db: LedgrDb;
let close: () => void;

const householdId = uuid();
const accountId = uuid();
const categoryGroupId = uuid();
const catGroceries = uuid();
const catDining = uuid();
const txnId = uuid();
const splitId1 = uuid();
const splitId2 = uuid();

beforeAll(() => {
  ({ db, close } = createTestDb());
  mockHouseholdId = householdId;

  db.insert(households).values({ id: householdId, name: "Test" }).run();
  db.insert(accounts)
    .values({
      id: accountId,
      householdId,
      name: "Checking",
      type: "checking",
      subtype: "checking",
    })
    .run();
  db.insert(categoryGroups)
    .values({ id: categoryGroupId, householdId, name: "Food", sortOrder: 1 })
    .run();
  db.insert(categories)
    .values([
      { id: catGroceries, householdId, groupId: categoryGroupId, name: "Groceries", sortOrder: 1 },
      { id: catDining, householdId, groupId: categoryGroupId, name: "Dining", sortOrder: 2 },
    ])
    .run();
  db.insert(transactions)
    .values({
      id: txnId,
      accountId,
      householdId,
      date: "2026-05-10",
      originalName: "WHOLE FOODS #123",
      name: "Whole Foods",
      amount: 5000,
      normalizedAmount: -5000,
      categoryId: catGroceries,
      categorySource: "manual",
      isTransfer: false,
    })
    .run();
  db.insert(transactionSplits)
    .values([
      { id: splitId1, transactionId: txnId, categoryId: catGroceries, amount: 3000 },
      { id: splitId2, transactionId: txnId, categoryId: catDining, amount: 2000 },
    ])
    .run();
});

afterAll(() => close());

describe("getTransactionDetail", () => {
  it("returns transaction with splits and category names", () => {
    const detail = getTransactionDetail(householdId, txnId, db);
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe(txnId);
    expect(detail!.name).toBe("Whole Foods");
    expect(detail!.categorySource).toBe("manual");
    expect(detail!.isTransfer).toBe(false);
    expect(detail!.plaidTransactionId).toBeNull();
    expect(detail!.splits).toHaveLength(2);
    // Splits come back in insert order; check by sorting to be safe
    const sortedSplits = [...detail!.splits].sort((a, b) =>
      a.categoryName!.localeCompare(b.categoryName!),
    );
    expect(sortedSplits[0].categoryName).toBe("Dining");
    expect(sortedSplits[1].categoryName).toBe("Groceries");
  });

  it("returns null for transaction in different household", () => {
    const detail = getTransactionDetail("other-household", txnId, db);
    expect(detail).toBeNull();
  });

  it("returns null for soft-deleted transaction", () => {
    const deletedId = uuid();
    db.insert(transactions)
      .values({
        id: deletedId,
        accountId,
        householdId,
        date: "2026-05-10",
        originalName: "DELETED",
        name: "Deleted",
        amount: 1000,
        normalizedAmount: -1000,
        deletedAt: new Date().toISOString(),
      })
      .run();
    const detail = getTransactionDetail(householdId, deletedId, db);
    expect(detail).toBeNull();
  });
});

describe("updateTransactionFields", () => {
  let editTxnId: string;
  let plaidTxnId: string;

  beforeAll(() => {
    editTxnId = uuid();
    db.insert(transactions)
      .values({
        id: editTxnId,
        accountId,
        householdId,
        date: "2026-05-08",
        originalName: "STARBUCKS #456",
        name: "Starbucks",
        amount: 650,
        normalizedAmount: -650,
      })
      .run();

    plaidTxnId = uuid();
    db.insert(transactions)
      .values({
        id: plaidTxnId,
        accountId,
        householdId,
        date: "2026-05-09",
        originalName: "PLAID TXN",
        name: "Plaid Txn",
        amount: 1200,
        normalizedAmount: -1200,
        plaidTransactionId: "plaid-abc-123",
      })
      .run();
  });

  it("updates name and notes with partial data", async () => {
    const result = await updateTransactionFields(
      editTxnId,
      { name: "Starbucks Reserve", notes: "Morning coffee" },
      db,
    );
    expect(result).toEqual({ success: true });

    const row = db
      .select({ name: transactions.name, notes: transactions.notes })
      .from(transactions)
      .where(eq(transactions.id, editTxnId))
      .get();
    expect(row!.name).toBe("Starbucks Reserve");
    expect(row!.notes).toBe("Morning coffee");
  });

  it("rejects invalid date format", async () => {
    const result = await updateTransactionFields(
      editTxnId,
      { date: "05/10/2026" },
      db,
    );
    expect(result).toEqual({ error: "Invalid input" });
  });

  it("rejects name exceeding 255 chars", async () => {
    const result = await updateTransactionFields(
      editTxnId,
      { name: "x".repeat(256) },
      db,
    );
    expect(result).toEqual({ error: "Invalid input" });
  });

  it("blocks date edit on Plaid-synced transactions", async () => {
    const result = await updateTransactionFields(
      plaidTxnId,
      { date: "2026-05-01" },
      db,
    );
    expect(result).toEqual({ error: "Cannot edit date on bank-synced transactions" });
  });
});

describe("upsertSplit", () => {
  let splitTxnId: string;

  beforeAll(() => {
    splitTxnId = uuid();
    db.insert(transactions)
      .values({
        id: splitTxnId,
        accountId,
        householdId,
        date: "2026-05-07",
        originalName: "COSTCO #789",
        name: "Costco",
        amount: 10000,
        normalizedAmount: -10000,
      })
      .run();
  });

  it("creates a split and sets categorySource to manual", async () => {
    const result = await upsertSplit(
      splitTxnId,
      null,
      { categoryId: catGroceries, amount: 6000, notes: null },
      db,
    );
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.categoryId).toBe(catGroceries);
      expect(result.data.amount).toBe(6000);
      expect(result.data.id).toBeTruthy();
    }

    const row = db
      .select({ categorySource: transactions.categorySource })
      .from(transactions)
      .where(eq(transactions.id, splitTxnId))
      .get();
    expect(row!.categorySource).toBe("manual");
  });

  it("rejects split that exceeds transaction amount", async () => {
    const result = await upsertSplit(
      splitTxnId,
      null,
      { categoryId: catDining, amount: 5000, notes: null },
      db,
    );
    // 6000 existing + 5000 new = 11000 > 10000
    expect(result).toEqual({ error: "Splits exceed transaction amount" });
  });

  it("updates an existing split", async () => {
    // Find the existing split we created
    const existing = db
      .select({ id: transactionSplits.id })
      .from(transactionSplits)
      .where(eq(transactionSplits.transactionId, splitTxnId))
      .get();

    const result = await upsertSplit(
      splitTxnId,
      existing!.id,
      { categoryId: catDining, amount: 7000, notes: "Updated" },
      db,
    );
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.id).toBe(existing!.id);
      expect(result.data.categoryId).toBe(catDining);
      expect(result.data.amount).toBe(7000);
      expect(result.data.notes).toBe("Updated");
    }
  });
});

describe("deleteSplit", () => {
  let delTxnId: string;
  let delSplitId: string;

  beforeAll(async () => {
    delTxnId = uuid();
    db.insert(transactions)
      .values({
        id: delTxnId,
        accountId,
        householdId,
        date: "2026-05-06",
        originalName: "TARGET #101",
        name: "Target",
        amount: 4000,
        normalizedAmount: -4000,
      })
      .run();

    delSplitId = uuid();
    db.insert(transactionSplits)
      .values({
        id: delSplitId,
        transactionId: delTxnId,
        categoryId: catGroceries,
        amount: 4000,
      })
      .run();
  });

  it("deletes all splits and verifies hasSplits becomes false", async () => {
    // Verify split exists first
    const before = getTransactionDetail(householdId, delTxnId, db);
    expect(before!.hasSplits).toBe(true);
    expect(before!.splits).toHaveLength(1);

    const result = await deleteSplit(delSplitId, db);
    expect(result).toEqual({ success: true });

    const after = getTransactionDetail(householdId, delTxnId, db);
    expect(after!.hasSplits).toBe(false);
    expect(after!.splits).toHaveLength(0);
  });
});

describe("split remaining balance math", () => {
  test.prop([
    fc.integer({ min: 100, max: 10_000_00 }),
    fc.array(fc.integer({ min: 1, max: 1_000_00 }), { minLength: 1, maxLength: 10 }),
  ])("sum of splits + remaining equals abs(amount)", (totalCents, rawSplitAmounts) => {
    const absTotal = Math.abs(totalCents);
    const cappedSplits: number[] = [];
    let runningTotal = 0;

    for (const amt of rawSplitAmounts) {
      if (runningTotal + amt > absTotal) break;
      cappedSplits.push(amt);
      runningTotal += amt;
    }

    const splitSum = cappedSplits.reduce((s, a) => s + a, 0);
    const remaining = absTotal - splitSum;

    expect(splitSum + remaining).toBe(absTotal);
    expect(remaining).toBeGreaterThanOrEqual(0);
  });
});
