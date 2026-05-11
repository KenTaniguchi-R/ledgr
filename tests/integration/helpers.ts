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
  investmentHoldings,
  holdingsHistory,
  investmentTransactions,
} from "../../src/db/schema";
import { encrypt } from "../../src/lib/encryption";

export async function insertHousehold(db: LedgrDb, name = "Test Household") {
  const id = uuid();
  await db.insert(households).values({ id, name });
  return { householdId: id };
}

export async function insertAccount(
  db: LedgrDb,
  householdId: string,
  overrides: Partial<typeof accounts.$inferInsert> = {},
) {
  const id = uuid();
  await db.insert(accounts).values({
    id,
    householdId,
    name: "Test Account",
    type: "checking",
    currency: "USD",
    ...overrides,
  });
  return { accountId: id };
}

export async function insertTransaction(
  db: LedgrDb,
  householdId: string,
  accountId: string,
  overrides: Partial<typeof transactions.$inferInsert> = {},
) {
  const id = uuid();
  const now = new Date();
  await db.insert(transactions).values({
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
  });
  return { transactionId: id };
}

export async function insertMerchant(
  db: LedgrDb,
  householdId: string,
  overrides: Partial<typeof merchants.$inferInsert> = {},
) {
  const id = uuid();
  const now = new Date();
  await db.insert(merchants).values({
    id,
    householdId,
    name: "Test Merchant",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  return { merchantId: id };
}

export async function insertCategoryGroup(
  db: LedgrDb,
  householdId: string,
  overrides: Partial<typeof categoryGroups.$inferInsert> = {},
) {
  const id = uuid();
  await db.insert(categoryGroups).values({
    id,
    householdId,
    name: "Test Group",
    ...overrides,
  });
  return { groupId: id };
}

export async function insertCategory(
  db: LedgrDb,
  householdId: string,
  groupId: string,
  overrides: Partial<typeof categories.$inferInsert> = {},
) {
  const id = uuid();
  await db.insert(categories).values({
    id,
    householdId,
    groupId,
    name: "Test Category",
    ...overrides,
  });
  return { categoryId: id };
}

export async function insertCategoryRule(
  db: LedgrDb,
  householdId: string,
  categoryId: string,
  overrides: Partial<typeof categoryRules.$inferInsert> = {},
) {
  const id = uuid();
  await db.insert(categoryRules).values({
    id,
    householdId,
    categoryId,
    matchPattern: "test",
    ...overrides,
  });
  return { ruleId: id };
}

export async function insertBudget(
  db: LedgrDb,
  householdId: string,
  overrides: Partial<typeof budgets.$inferInsert> = {},
) {
  const id = uuid();
  const now = new Date();
  await db.insert(budgets).values({
    id,
    householdId,
    month: "2026-05",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  return { budgetId: id };
}

export async function insertBudgetCategory(
  db: LedgrDb,
  budgetId: string,
  categoryId: string,
  overrides: Partial<typeof budgetCategories.$inferInsert> = {},
) {
  const id = uuid();
  await db.insert(budgetCategories).values({
    id,
    budgetId,
    categoryId,
    limitAmount: 10000,
    ...overrides,
  });
  return { budgetCategoryId: id };
}

export async function insertTransactionSplit(
  db: LedgrDb,
  transactionId: string,
  categoryId: string,
  amount: number,
  overrides: Partial<typeof transactionSplits.$inferInsert> = {},
) {
  const id = uuid();
  await db.insert(transactionSplits).values({
    id,
    transactionId,
    categoryId,
    amount,
    ...overrides,
  });
  return { splitId: id };
}

export async function insertPlaidItem(
  db: LedgrDb,
  householdId: string,
  overrides: Partial<typeof plaidItems.$inferInsert> = {},
) {
  const id = uuid();
  const now = new Date();
  await db.insert(plaidItems).values({
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
  });
  return { plaidItemId: id };
}

export async function insertRecurringTransaction(
  db: LedgrDb,
  householdId: string,
  overrides: Partial<typeof recurringTransactions.$inferInsert> = {},
) {
  const id = uuid();
  const now = new Date();
  await db.insert(recurringTransactions).values({
    id,
    householdId,
    name: "Test Recurring",
    isActive: true,
    isIncome: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  return { recurringId: id };
}

export async function insertInvestmentHolding(
  db: LedgrDb,
  accountId: string,
  overrides: Partial<typeof investmentHoldings.$inferInsert> = {},
) {
  const id = uuid();
  const now = new Date();
  await db.insert(investmentHoldings).values({
    id,
    accountId,
    securityName: "Test Stock",
    ticker: "TST",
    quantity: 10,
    currentValue: 150000,
    costBasis: 120000,
    type: "stock",
    asOfDate: "2026-05-10",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  return { holdingId: id };
}

export async function insertHoldingsSnapshot(
  db: LedgrDb,
  accountId: string,
  date: string,
  overrides: Partial<typeof holdingsHistory.$inferInsert> = {},
) {
  const id = uuid();
  await db.insert(holdingsHistory).values({
    id,
    accountId,
    date,
    value: 150000,
    ...overrides,
  });
  return { snapshotId: id };
}

export async function insertInvestmentTransaction(
  db: LedgrDb,
  accountId: string,
  overrides: Partial<typeof investmentTransactions.$inferInsert> = {},
) {
  const id = uuid();
  const now = new Date();
  await db.insert(investmentTransactions).values({
    id,
    accountId,
    type: "buy",
    amount: 75000,
    date: "2026-05-01",
    createdAt: now,
    ...overrides,
  });
  return { investmentTxnId: id };
}
