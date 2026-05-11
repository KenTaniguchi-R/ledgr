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
  transactions,
  merchants,
  categoryRules,
} from "../../src/db/schema";
import { eq } from "drizzle-orm";
import type { LedgrDb } from "../../src/db";

describe("test helpers", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  it("creates full FK chain: household → account → transaction", async () => {
    const { householdId } = await insertHousehold(db);
    const { accountId } = await insertAccount(db, householdId);
    const { transactionId } = await insertTransaction(db, householdId, accountId);

    const [row] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId));
    expect(row).toBeDefined();
    expect(row!.householdId).toBe(householdId);
    expect(row!.accountId).toBe(accountId);
  });

  it("creates merchant with household FK", async () => {
    const { householdId } = await insertHousehold(db);
    const { merchantId } = await insertMerchant(db, householdId);

    const [row] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.id, merchantId));
    expect(row).toBeDefined();
    expect(row!.householdId).toBe(householdId);
  });

  it("creates category chain: group → category → rule", async () => {
    const { householdId } = await insertHousehold(db);
    const { groupId } = await insertCategoryGroup(db, householdId);
    const { categoryId } = await insertCategory(db, householdId, groupId);
    const { ruleId } = await insertCategoryRule(db, householdId, categoryId);

    const [rule] = await db
      .select()
      .from(categoryRules)
      .where(eq(categoryRules.id, ruleId));
    expect(rule).toBeDefined();
    expect(rule!.categoryId).toBe(categoryId);
  });
});
