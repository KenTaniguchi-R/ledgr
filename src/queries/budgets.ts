import { eq, inArray, desc } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  budgets,
  budgetCategories,
  categories,
  categoryGroups,
  plaidItems,
} from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { monthBounds } from "@/lib/date-utils";
import { aggregateSpending } from "@/lib/spending-helpers";
import { UNCATEGORIZED } from "@/lib/labels";

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
  lastSyncedAt: Date | null;
}

// ── Main budget query ────────────────────────────────────────────────

export async function getBudgetForMonth(
  householdId: string,
  month: string,
  db: LedgrDb = defaultDb,
): Promise<BudgetMonth> {
  const scoped = scopedQuery(householdId, db);

  // Fetch budget row
  const [budgetRow] = await db
    .select()
    .from(budgets)
    .where(scoped.where(budgets, eq(budgets.month, month)))
    .limit(1);

  const { from: dateFrom, to: dateTo } = monthBounds(month);
  const spending = await aggregateSpending(householdId, { dateFrom, dateTo }, db);

  // Last synced at
  const [syncRow] = await db
    .select({ updatedAt: plaidItems.updatedAt })
    .from(plaidItems)
    .where(scoped.where(plaidItems, eq(plaidItems.status, "active")))
    .orderBy(desc(plaidItems.updatedAt))
    .limit(1);

  const lastSyncedAt = syncRow?.updatedAt ?? null;

  // No budget: all spending is unbudgeted
  if (!budgetRow) {
    const unbudgetedCategories = await buildUnbudgetedCategories(spending, new Set(), db);
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
  const budgetCatRows = await db
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
    .where(eq(budgetCategories.budgetId, budgetRow.id));

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
  const unbudgetedCategories = await buildUnbudgetedCategories(spending, budgetedCategoryIds, db);
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

async function buildUnbudgetedCategories(
  spending: Map<string, number>,
  budgetedCategoryIds: Set<string>,
  db: LedgrDb,
): Promise<UnbudgetedCategory[]> {
  const result: UnbudgetedCategory[] = [];
  const unbudgetedIds: string[] = [];

  for (const [key, spent] of spending) {
    if (budgetedCategoryIds.has(key)) continue;
    if (key === "uncategorized") {
      result.push({
        categoryId: "uncategorized",
        categoryName: UNCATEGORIZED,
        groupName: "Other",
        spent,
      });
    } else {
      unbudgetedIds.push(key);
    }
  }

  if (unbudgetedIds.length > 0) {
    const catRows = await db
      .select({
        id: categories.id,
        categoryName: categories.name,
        groupName: categoryGroups.name,
      })
      .from(categories)
      .innerJoin(categoryGroups, eq(categories.groupId, categoryGroups.id))
      .where(inArray(categories.id, unbudgetedIds));

    const catMap = new Map(catRows.map((r) => [r.id, r]));

    for (const id of unbudgetedIds) {
      const cat = catMap.get(id);
      if (cat) {
        result.push({
          categoryId: id,
          categoryName: cat.categoryName,
          groupName: cat.groupName,
          spent: spending.get(id)!,
        });
      }
    }
  }

  return result;
}
