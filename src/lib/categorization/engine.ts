import { eq, and, isNull, inArray } from "drizzle-orm";
import type { LedgrDb } from "@/db";
import { transactions, merchants, categoryRules, accounts, categories } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";
import { nowISO } from "@/lib/date-utils";
import { PFC_DETAILED_TO_CATEGORY } from "./pfc-map";

export interface CategorizableTransaction {
  id: string;
  name: string;
  merchantId: string | null;
  merchantName: string | null;
  merchantCategoryId: string | null;
  pfcDetailed: string | null;
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
  source: "rule" | "merchant_default" | "pfc";
}

export function categorizeTransactions(
  transactions: CategorizableTransaction[],
  rules: CategoryRule[],
  pfcCategoryMap: Map<string, string> = new Map(),
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
      matched = true;
    }

    if (!matched && txn.pfcDetailed) {
      const pfcCategoryId = pfcCategoryMap.get(txn.pfcDetailed);
      if (pfcCategoryId) {
        assignments.push({
          transactionId: txn.id,
          categoryId: pfcCategoryId,
          source: "pfc",
        });
      }
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

  const allCategories = db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.householdId, householdId))
    .all();
  const catNameToId = new Map(allCategories.map((c) => [c.name, c.id]));
  const pfcCategoryMap = new Map<string, string>();
  for (const [pfcCode, catName] of Object.entries(PFC_DETAILED_TO_CATEGORY)) {
    const catId = catNameToId.get(catName);
    if (catId) pfcCategoryMap.set(pfcCode, catId);
  }

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
      pfcDetailed: transactions.pfcDetailed,
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

  const merchantIds = [...new Set(
    uncategorized.map((t) => t.merchantId).filter((id): id is string => id !== null),
  )];
  const merchantMap = new Map<string, { name: string; categoryId: string | null }>();
  if (merchantIds.length > 0) {
    const merchantRows = db
      .select({ id: merchants.id, name: merchants.name, categoryId: merchants.categoryId })
      .from(merchants)
      .where(inArray(merchants.id, merchantIds))
      .all();
    for (const m of merchantRows) {
      merchantMap.set(m.id, { name: m.name, categoryId: m.categoryId });
    }
  }

  const categorizableTxns: CategorizableTransaction[] = uncategorized.map((txn) => {
    const merchant = txn.merchantId ? merchantMap.get(txn.merchantId) : undefined;
    return {
      id: txn.id,
      name: txn.name,
      merchantId: txn.merchantId,
      merchantName: merchant?.name ?? null,
      merchantCategoryId: merchant?.categoryId ?? null,
      pfcDetailed: txn.pfcDetailed ?? null,
    };
  });

  const assignments = categorizeTransactions(categorizableTxns, rules, pfcCategoryMap);
  if (assignments.length === 0) return;

  const now = nowISO();
  db.transaction((tx) => {
    for (const assignment of assignments) {
      tx.update(transactions)
        .set({
          categoryId: assignment.categoryId,
          categorySource: assignment.source,
          updatedAt: now,
        })
        .where(eq(transactions.id, assignment.transactionId))
        .run();
    }
  });
}
