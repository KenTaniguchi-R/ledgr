import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./setup";
import { scopedQuery } from "../../src/lib/scoped-query";
import {
  households,
  accounts,
  transactions,
  categoryGroups,
  categories,
} from "../../src/db/schema";

describe("scopedQuery - household data isolation", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let close: () => void;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    close = testDb.close;

    // Seed two households
    db.insert(households).values([
      { id: "hh-a", name: "Household A" },
      { id: "hh-b", name: "Household B" },
    ]).run();

    // Seed accounts for each household
    db.insert(accounts).values([
      {
        id: "acc-a1",
        householdId: "hh-a",
        name: "Checking A",
        type: "checking",
      },
      {
        id: "acc-b1",
        householdId: "hh-b",
        name: "Checking B",
        type: "checking",
      },
    ]).run();

    // Seed category groups and categories for transactions
    db.insert(categoryGroups).values([
      { id: "cg-a", householdId: "hh-a", name: "Expenses A" },
      { id: "cg-b", householdId: "hh-b", name: "Expenses B" },
    ]).run();

    db.insert(categories).values([
      { id: "cat-a", householdId: "hh-a", groupId: "cg-a", name: "Food A" },
      { id: "cat-b", householdId: "hh-b", groupId: "cg-b", name: "Food B" },
    ]).run();

    // Seed transactions
    db.insert(transactions).values([
      {
        id: "txn-a1",
        accountId: "acc-a1",
        householdId: "hh-a",
        date: "2026-01-15",
        originalName: "Grocery Store",
        name: "Grocery Store",
        amount: 5000,
        normalizedAmount: -5000,
      },
      {
        id: "txn-b1",
        accountId: "acc-b1",
        householdId: "hh-b",
        date: "2026-01-15",
        originalName: "Restaurant",
        name: "Restaurant",
        amount: 3000,
        normalizedAmount: -3000,
      },
    ]).run();
  });

  afterEach(() => {
    close();
  });

  it("where() filters to only the specified household", () => {
    const scoped = scopedQuery("hh-a", db);
    const result = db
      .select()
      .from(accounts)
      .where(scoped.where(accounts))
      .all();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Checking A");
  });

  it("household A cannot see household B transactions", () => {
    const scoped = scopedQuery("hh-a", db);
    const result = db
      .select()
      .from(transactions)
      .where(scoped.where(transactions))
      .all();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("txn-a1");
    expect(result.every((t) => t.householdId === "hh-a")).toBe(true);
  });

  it("household B cannot see household A transactions", () => {
    const scoped = scopedQuery("hh-b", db);
    const result = db
      .select()
      .from(transactions)
      .where(scoped.where(transactions))
      .all();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("txn-b1");
    expect(result.every((t) => t.householdId === "hh-b")).toBe(true);
  });

  it("where() combines with additional conditions", () => {
    db.insert(transactions).values({
      id: "txn-a2",
      accountId: "acc-a1",
      householdId: "hh-a",
      date: "2026-01-20",
      originalName: "Coffee Shop",
      name: "Coffee Shop",
      amount: 500,
      normalizedAmount: -500,
    }).run();

    const scoped = scopedQuery("hh-a", db);
    const result = db
      .select()
      .from(transactions)
      .where(scoped.where(transactions, eq(transactions.id, "txn-a2")))
      .all();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Coffee Shop");
  });

  it("non-existent household returns empty results", () => {
    const scoped = scopedQuery("hh-nonexistent", db);
    const result = db
      .select()
      .from(transactions)
      .where(scoped.where(transactions))
      .all();

    expect(result).toHaveLength(0);
  });
});
