import { eq, and, isNull, inArray } from "drizzle-orm";
import type { LedgrDb } from "@/db";
import { transactions, merchants, categoryRules, accounts } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";

export interface CategorizableTransaction {
  id: string;
  name: string;
  merchantId: string | null;
  merchantName: string | null;
  merchantCategoryId: string | null;
}

export interface CategoryRule {
  id: string;
  categoryId: string;
  matchField: "name" | "merchant";
  matchPattern: string;
  priority: number;
}

export interface CategoryAssignment {
  transactionId: string;
  categoryId: string;
  source: "rule" | "merchant_default";
}

export function categorizeTransactions(
  transactions: CategorizableTransaction[],
  rules: CategoryRule[],
): CategoryAssignment[] {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  const assignments: CategoryAssignment[] = [];

  for (const txn of transactions) {
    let matched = false;

    for (const rule of sorted) {
      const target =
        rule.matchField === "merchant" ? txn.merchantName : txn.name;
      if (!target) continue;

      if (target.toLowerCase().includes(rule.matchPattern.toLowerCase())) {
        assignments.push({
          transactionId: txn.id,
          categoryId: rule.categoryId,
          source: "rule",
        });
        matched = true;
        break;
      }
    }

    if (!matched && txn.merchantCategoryId) {
      assignments.push({
        transactionId: txn.id,
        categoryId: txn.merchantCategoryId,
        source: "merchant_default",
      });
    }
  }

  return assignments;
}

export function categorizeSyncedTransactions(
  plaidItemId: string,
  householdId: string,
  db: LedgrDb,
): void {
  const scoped = scopedQuery(householdId, db);

  // 1. Fetch rules ordered by priority DESC
  const rules = db
    .select({
      id: categoryRules.id,
      categoryId: categoryRules.categoryId,
      matchField: categoryRules.matchField,
      matchPattern: categoryRules.matchPattern,
      priority: categoryRules.priority,
    })
    .from(categoryRules)
    .where(scoped.where(categoryRules))
    .all() as CategoryRule[];

  // 2. Fetch uncategorized transactions for this plaidItem's accounts
  const itemAccounts = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.householdId, householdId),
        eq(accounts.plaidItemId, plaidItemId),
      ),
    )
    .all();

  if (itemAccounts.length === 0) return;

  const accountIds = itemAccounts.map((a) => a.id);

  const uncategorized = db
    .select({
      id: transactions.id,
      name: transactions.name,
      merchantId: transactions.merchantId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        inArray(transactions.accountId, accountIds),
        isNull(transactions.categoryId),
        notDeleted(transactions),
      ),
    )
    .all();

  if (uncategorized.length === 0) return;

  // 3. Hydrate merchant data
  const categorizableTxns: CategorizableTransaction[] = uncategorized.map((txn) => {
    let merchantName: string | null = null;
    let merchantCategoryId: string | null = null;

    if (txn.merchantId) {
      const merchant = db
        .select({ name: merchants.name, categoryId: merchants.categoryId })
        .from(merchants)
        .where(eq(merchants.id, txn.merchantId))
        .get();
      if (merchant) {
        merchantName = merchant.name;
        merchantCategoryId = merchant.categoryId;
      }
    }

    return {
      id: txn.id,
      name: txn.name,
      merchantId: txn.merchantId,
      merchantName,
      merchantCategoryId,
    };
  });

  // 4. Run pure categorization
  const assignments = categorizeTransactions(categorizableTxns, rules);
  if (assignments.length === 0) return;

  // 5. Apply assignments
  const now = new Date().toISOString();
  db.transaction((tx) => {
    for (const assignment of assignments) {
      tx.update(transactions)
        .set({ categoryId: assignment.categoryId, updatedAt: now })
        .where(eq(transactions.id, assignment.transactionId))
        .run();
    }
  });
}
