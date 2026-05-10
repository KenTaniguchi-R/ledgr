import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertTransaction,
  insertMerchant,
  insertCategoryGroup,
  insertCategory,
  insertCategoryRule,
} from "./helpers";
import {
  households,
  accounts,
  transactions,
  merchants,
  categoryGroups,
  categories,
  categoryRules,
} from "../../src/db/schema";
import { eq } from "drizzle-orm";
import type { LedgrDb } from "../../src/db";

describe("test helpers", () => {
  let db: LedgrDb;
  let close: () => void;

  beforeAll(() => {
    const testDb = createTestDb();
    db = testDb.db;
    close = testDb.close;
  });

  afterAll(() => close());

  it("creates full FK chain: household → account → transaction", () => {
    const { householdId } = insertHousehold(db);
    const { accountId } = insertAccount(db, householdId);
    const { transactionId } = insertTransaction(db, householdId, accountId);

    const row = db
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .get();
    expect(row).toBeDefined();
    expect(row!.householdId).toBe(householdId);
    expect(row!.accountId).toBe(accountId);
  });

  it("creates merchant with household FK", () => {
    const { householdId } = insertHousehold(db);
    const { merchantId } = insertMerchant(db, householdId);

    const row = db
      .select()
      .from(merchants)
      .where(eq(merchants.id, merchantId))
      .get();
    expect(row).toBeDefined();
    expect(row!.householdId).toBe(householdId);
  });

  it("creates category chain: group → category → rule", () => {
    const { householdId } = insertHousehold(db);
    const { groupId } = insertCategoryGroup(db, householdId);
    const { categoryId } = insertCategory(db, householdId, groupId);
    const { ruleId } = insertCategoryRule(db, householdId, categoryId);

    const rule = db
      .select()
      .from(categoryRules)
      .where(eq(categoryRules.id, ruleId))
      .get();
    expect(rule).toBeDefined();
    expect(rule!.categoryId).toBe(categoryId);
  });
});
