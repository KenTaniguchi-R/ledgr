import { v4 as uuid } from "uuid";
import type { LedgrDb } from "../../src/db";
import {
  households,
  accounts,
  transactions,
  merchants,
  categoryGroups,
  categories,
  categoryRules,
} from "../../src/db/schema";

export function insertHousehold(db: LedgrDb, name = "Test Household") {
  const id = uuid();
  db.insert(households).values({ id, name }).run();
  return { householdId: id };
}

export function insertAccount(
  db: LedgrDb,
  householdId: string,
  overrides: Partial<typeof accounts.$inferInsert> = {},
) {
  const id = uuid();
  db.insert(accounts)
    .values({
      id,
      householdId,
      name: "Test Account",
      type: "checking",
      currency: "USD",
      ...overrides,
    })
    .run();
  return { accountId: id };
}

export function insertTransaction(
  db: LedgrDb,
  householdId: string,
  accountId: string,
  overrides: Partial<typeof transactions.$inferInsert> = {},
) {
  const id = uuid();
  const now = new Date().toISOString();
  db.insert(transactions)
    .values({
      id,
      accountId,
      householdId,
      date: "2026-05-01",
      originalName: "Test Transaction",
      name: "Test Transaction",
      amount: -1000,
      normalizedAmount: 1000,
      currency: "USD",
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .run();
  return { transactionId: id };
}

export function insertMerchant(
  db: LedgrDb,
  householdId: string,
  overrides: Partial<typeof merchants.$inferInsert> = {},
) {
  const id = uuid();
  const now = new Date().toISOString();
  db.insert(merchants)
    .values({
      id,
      householdId,
      name: "Test Merchant",
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .run();
  return { merchantId: id };
}

export function insertCategoryGroup(
  db: LedgrDb,
  householdId: string,
  overrides: Partial<typeof categoryGroups.$inferInsert> = {},
) {
  const id = uuid();
  db.insert(categoryGroups)
    .values({
      id,
      householdId,
      name: "Test Group",
      ...overrides,
    })
    .run();
  return { groupId: id };
}

export function insertCategory(
  db: LedgrDb,
  householdId: string,
  groupId: string,
  overrides: Partial<typeof categories.$inferInsert> = {},
) {
  const id = uuid();
  db.insert(categories)
    .values({
      id,
      householdId,
      groupId,
      name: "Test Category",
      ...overrides,
    })
    .run();
  return { categoryId: id };
}

export function insertCategoryRule(
  db: LedgrDb,
  householdId: string,
  categoryId: string,
  overrides: Partial<typeof categoryRules.$inferInsert> = {},
) {
  const id = uuid();
  db.insert(categoryRules)
    .values({
      id,
      householdId,
      categoryId,
      matchPattern: "test",
      ...overrides,
    })
    .run();
  return { ruleId: id };
}
