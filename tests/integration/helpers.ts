import { v4 as uuid } from "uuid";
import type { LedgrDb } from "../../src/db";
import {
  households,
  accounts,
  transactions,
  transactionSplits,
  merchants,
  categoryGroups,
  categories,
  categoryRules,
  budgets,
  budgetCategories,
  plaidItems,
  recurringTransactions,
} from "../../src/db/schema";
import { encrypt } from "../../src/lib/encryption";

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

export function insertBudget(
  db: LedgrDb,
  householdId: string,
  overrides: Partial<typeof budgets.$inferInsert> = {},
) {
  const id = uuid();
  const now = new Date().toISOString();
  db.insert(budgets)
    .values({
      id,
      householdId,
      month: "2026-05",
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .run();
  return { budgetId: id };
}

export function insertBudgetCategory(
  db: LedgrDb,
  budgetId: string,
  categoryId: string,
  overrides: Partial<typeof budgetCategories.$inferInsert> = {},
) {
  const id = uuid();
  db.insert(budgetCategories)
    .values({
      id,
      budgetId,
      categoryId,
      limitAmount: 10000,
      ...overrides,
    })
    .run();
  return { budgetCategoryId: id };
}

export function insertTransactionSplit(
  db: LedgrDb,
  transactionId: string,
  categoryId: string,
  amount: number,
  overrides: Partial<typeof transactionSplits.$inferInsert> = {},
) {
  const id = uuid();
  db.insert(transactionSplits)
    .values({
      id,
      transactionId,
      categoryId,
      amount,
      ...overrides,
    })
    .run();
  return { splitId: id };
}

export function insertPlaidItem(
  db: LedgrDb,
  householdId: string,
  overrides: Partial<typeof plaidItems.$inferInsert> = {},
) {
  const id = uuid();
  const now = new Date().toISOString();
  db.insert(plaidItems)
    .values({
      id,
      householdId,
      accessToken: encrypt("access-sandbox-test-token"),
      plaidInstitutionId: "ins_1",
      plaidItemId: `plaid-item-${id.slice(0, 8)}`,
      institutionName: "Test Bank",
      status: "active",
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .run();
  return { plaidItemId: id };
}

export function insertRecurringTransaction(
  db: LedgrDb,
  householdId: string,
  overrides: Partial<typeof recurringTransactions.$inferInsert> = {},
) {
  const id = uuid();
  const now = new Date().toISOString();
  db.insert(recurringTransactions)
    .values({
      id,
      householdId,
      name: "Test Recurring",
      isActive: true,
      isIncome: false,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .run();
  return { recurringId: id };
}
