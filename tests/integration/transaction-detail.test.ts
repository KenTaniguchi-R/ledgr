import { describe, it, expect, beforeAll, afterAll } from "vitest";
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

  db.insert(households).values({ id: householdId, name: "Test" }).run();
  db.insert(accounts)
    .values({
      id: accountId,
      householdId,
      name: "Checking",
      type: "depository",
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
