import { eq, gt, gte, lt, sql, inArray, notInArray, desc } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  budgets,
  budgetCategories,
  transactions,
  transactionSplits,
  categories,
  categoryGroups,
  plaidItems,
} from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";
import { shiftMonth } from "@/lib/date-utils";

// ── Types ────────────────────────────────────────────────────────────

export interface BudgetCategoryRow {
  budgetCategoryId: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string | null;
  limitAmount: number;
  spent: number;
  remaining: number;
  isFixed: boolean;
}

export interface BudgetGroup {
  groupId: string;
  groupName: string;
  groupIcon: string | null;
  categories: BudgetCategoryRow[];
  totalBudgeted: number;
  totalSpent: number;
}

export interface UnbudgetedCategory {
  categoryId: string;
  categoryName: string;
  groupName: string;
  spent: number;
}

export interface BudgetMonth {
  budget: { id: string; month: string; type: "category" | "flex" } | null;
  groups: BudgetGroup[];
  unbudgeted: { spent: number; categories: UnbudgetedCategory[] };
  summary: { totalBudgeted: number; totalSpent: number; totalRemaining: number };
  lastSyncedAt: string | null;
}

// ── Spending query ───────────────────────────────────────────────────

/**
 * Aggregate spending per category for a given month.
 * Returns Map<categoryId | "uncategorized", spentCents>.
 *
 * Handles split transactions: when a transaction has splits,
 * the parent is excluded and splits are summed per category instead.
 */
function getBudgetSpending(
  householdId: string,
  month: string,
  db: LedgrDb = defaultDb,
): Map<string, number> {
  const scoped = scopedQuery(householdId, db);
  const startDate = `${month}-01`;
  const endDate = `${shiftMonth(month, 1)}-01`;

  // Find transaction IDs that have splits
  const splitParentRows = db
    .select({ transactionId: transactionSplits.transactionId })
    .from(transactionSplits)
    .innerJoin(transactions, eq(transactionSplits.transactionId, transactions.id))
    .where(
      scoped.where(
        transactions,
        notDeleted(transactions),
        gte(transactions.date, startDate),
        lt(transactions.date, endDate),
        gt(transactions.normalizedAmount, 0),
        eq(transactions.isTransfer, false),
        eq(transactions.pending, false),
      ),
    )
    .groupBy(transactionSplits.transactionId)
    .all();

  const splitParentIds = splitParentRows.map((r) => r.transactionId);

  // 1) Non-split transactions: aggregate by category_id
  const baseConditions = [
    notDeleted(transactions),
    gte(transactions.date, startDate),
    lt(transactions.date, endDate),
    gt(transactions.normalizedAmount, 0),
    eq(transactions.isTransfer, false),
    eq(transactions.pending, false),
  ];

  const nonSplitConditions =
    splitParentIds.length > 0
      ? [...baseConditions, notInArray(transactions.id, splitParentIds)]
      : baseConditions;

  const nonSplitRows = db
    .select({
      categoryId: transactions.categoryId,
      total: sql<number>`COALESCE(SUM(${transactions.normalizedAmount}), 0)`,
    })
    .from(transactions)
    .where(scoped.where(transactions, ...nonSplitConditions))
    .groupBy(transactions.categoryId)
    .all();

  const spending = new Map<string, number>();

  for (const row of nonSplitRows) {
    const key = row.categoryId ?? "uncategorized";
    spending.set(key, (spending.get(key) ?? 0) + row.total);
  }

  // 2) Split transactions: aggregate from transaction_splits per category
  if (splitParentIds.length > 0) {
    const splitRows = db
      .select({
        categoryId: transactionSplits.categoryId,
        total: sql<number>`COALESCE(SUM(${transactionSplits.amount}), 0)`,
      })
      .from(transactionSplits)
      .where(inArray(transactionSplits.transactionId, splitParentIds))
      .groupBy(transactionSplits.categoryId)
      .all();

    for (const row of splitRows) {
      spending.set(row.categoryId, (spending.get(row.categoryId) ?? 0) + row.total);
    }
  }

  return spending;
}

// ── Main budget query ────────────────────────────────────────────────

export function getBudgetForMonth(
  householdId: string,
  month: string,
  db: LedgrDb = defaultDb,
): BudgetMonth {
  const scoped = scopedQuery(householdId, db);

  // Fetch budget row
  const budgetRow = db
    .select()
    .from(budgets)
    .where(scoped.where(budgets, eq(budgets.month, month)))
    .get();

  // Fetch spending map
  const spending = getBudgetSpending(householdId, month, db);

  // Last synced at
  const syncRow = db
    .select({ updatedAt: plaidItems.updatedAt })
    .from(plaidItems)
    .where(scoped.where(plaidItems, eq(plaidItems.status, "active")))
    .orderBy(desc(plaidItems.updatedAt))
    .limit(1)
    .get();

  const lastSyncedAt = syncRow?.updatedAt ?? null;

  // No budget: all spending is unbudgeted
  if (!budgetRow) {
    const unbudgetedCategories = buildUnbudgetedCategories(spending, new Set(), db);
    const totalSpent = [...spending.values()].reduce((a, b) => a + b, 0);
    return {
      budget: null,
      groups: [],
      unbudgeted: { spent: totalSpent, categories: unbudgetedCategories },
      summary: { totalBudgeted: 0, totalSpent, totalRemaining: -totalSpent },
      lastSyncedAt,
    };
  }

  // Fetch budget categories with joins
  const budgetCatRows = db
    .select({
      budgetCategoryId: budgetCategories.id,
      categoryId: budgetCategories.categoryId,
      limitAmount: budgetCategories.limitAmount,
      isFixed: budgetCategories.isFixed,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      groupId: categoryGroups.id,
      groupName: categoryGroups.name,
      groupIcon: categoryGroups.icon,
    })
    .from(budgetCategories)
    .innerJoin(categories, eq(budgetCategories.categoryId, categories.id))
    .innerJoin(categoryGroups, eq(categories.groupId, categoryGroups.id))
    .where(eq(budgetCategories.budgetId, budgetRow.id))
    .all();

  // Build groups
  const groupMap = new Map<string, BudgetGroup>();
  const budgetedCategoryIds = new Set<string>();

  for (const row of budgetCatRows) {
    budgetedCategoryIds.add(row.categoryId);
    const spent = spending.get(row.categoryId) ?? 0;

    const catRow: BudgetCategoryRow = {
      budgetCategoryId: row.budgetCategoryId,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      categoryIcon: row.categoryIcon,
      limitAmount: row.limitAmount,
      spent,
      remaining: row.limitAmount - spent,
      isFixed: Boolean(row.isFixed),
    };

    if (!groupMap.has(row.groupId)) {
      groupMap.set(row.groupId, {
        groupId: row.groupId,
        groupName: row.groupName,
        groupIcon: row.groupIcon,
        categories: [],
        totalBudgeted: 0,
        totalSpent: 0,
      });
    }

    const group = groupMap.get(row.groupId)!;
    group.categories.push(catRow);
    group.totalBudgeted += row.limitAmount;
    group.totalSpent += spent;
  }

  const groups = [...groupMap.values()];

  // Unbudgeted categories
  const unbudgetedCategories = buildUnbudgetedCategories(spending, budgetedCategoryIds, db);
  const unbudgetedSpent = unbudgetedCategories.reduce((a, c) => a + c.spent, 0);

  // Summary
  const totalBudgeted = groups.reduce((a, g) => a + g.totalBudgeted, 0);
  const totalSpent = groups.reduce((a, g) => a + g.totalSpent, 0) + unbudgetedSpent;
  const totalRemaining = totalBudgeted - totalSpent;

  return {
    budget: {
      id: budgetRow.id,
      month: budgetRow.month,
      type: (budgetRow.type as "category" | "flex") ?? "category",
    },
    groups,
    unbudgeted: { spent: unbudgetedSpent, categories: unbudgetedCategories },
    summary: { totalBudgeted, totalSpent, totalRemaining },
    lastSyncedAt,
  };
}

// ── Build unbudgeted categories list ─────────────────────────────────

function buildUnbudgetedCategories(
  spending: Map<string, number>,
  budgetedCategoryIds: Set<string>,
  db: LedgrDb,
): UnbudgetedCategory[] {
  const result: UnbudgetedCategory[] = [];

  for (const [key, spent] of spending) {
    if (budgetedCategoryIds.has(key)) continue;

    if (key === "uncategorized") {
      result.push({
        categoryId: "uncategorized",
        categoryName: "Uncategorized",
        groupName: "Other",
        spent,
      });
    } else {
      // Look up category + group name
      const catRow = db
        .select({
          categoryName: categories.name,
          groupName: categoryGroups.name,
        })
        .from(categories)
        .innerJoin(categoryGroups, eq(categories.groupId, categoryGroups.id))
        .where(eq(categories.id, key))
        .get();

      if (catRow) {
        result.push({
          categoryId: key,
          categoryName: catRow.categoryName,
          groupName: catRow.groupName,
          spent,
        });
      }
    }
  }

  return result;
}
