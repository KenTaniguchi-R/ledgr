import { tool } from "ai";
import { z } from "zod";
import { db } from "@/db";
import {
  transactions,
  accounts,
  categories,
  categoryGroups,
  recurringTransactions,
  budgets,
  budgetCategories,
} from "@/db/schema";
import { eq, and, gte, lte, like, desc } from "drizzle-orm";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";

export function financialTools(householdId: string) {
  const scoped = scopedQuery(householdId);

  return {
    getSpendingByCategory: tool({
      description: "Get spending breakdown by category for a date range",
      inputSchema: z.object({
        startDate: z.string().describe("Start date (YYYY-MM-DD)"),
        endDate: z.string().describe("End date (YYYY-MM-DD)"),
      }),
      execute: async ({ startDate, endDate }) => {
        const rows = db
          .select({
            categoryName: categories.name,
            groupName: categoryGroups.name,
            amount: transactions.amount,
          })
          .from(transactions)
          .leftJoin(categories, eq(transactions.categoryId, categories.id))
          .leftJoin(categoryGroups, eq(categories.groupId, categoryGroups.id))
          .where(
            and(
              scoped.where(transactions),
              gte(transactions.date, startDate),
              lte(transactions.date, endDate),
              notDeleted(transactions)
            )
          )
          .all();

        const byCategory = new Map<string, number>();
        for (const row of rows) {
          if (row.amount <= 0) continue;
          const key = row.categoryName ?? "Uncategorized";
          byCategory.set(key, (byCategory.get(key) ?? 0) + row.amount);
        }

        return Array.from(byCategory.entries())
          .map(([category, totalCents]) => ({
            category,
            amount: `$${(totalCents / 100).toFixed(2)}`,
          }))
          .sort(
            (a, b) =>
              parseFloat(b.amount.slice(1)) - parseFloat(a.amount.slice(1))
          )
          .slice(0, 15);
      },
    }),

    searchTransactions: tool({
      description:
        "Search transactions by description, date range, or category",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe("Search text in transaction name"),
        startDate: z.string().optional().describe("Start date (YYYY-MM-DD)"),
        endDate: z.string().optional().describe("End date (YYYY-MM-DD)"),
        category: z
          .string()
          .optional()
          .describe("Category name to filter by"),
      }),
      execute: async ({ query, startDate, endDate }) => {
        const conditions = [scoped.where(transactions), notDeleted(transactions)];
        if (query) conditions.push(like(transactions.name, `%${query}%`));
        if (startDate) conditions.push(gte(transactions.date, startDate));
        if (endDate) conditions.push(lte(transactions.date, endDate));

        const rows = db
          .select({
            date: transactions.date,
            name: transactions.name,
            amount: transactions.amount,
            categoryName: categories.name,
          })
          .from(transactions)
          .leftJoin(categories, eq(transactions.categoryId, categories.id))
          .where(and(...conditions))
          .orderBy(desc(transactions.date))
          .limit(20)
          .all();

        return rows.map((r) => ({
          date: r.date,
          description: r.name.slice(0, 60),
          amount: `$${(Math.abs(r.amount) / 100).toFixed(2)}`,
          type: r.amount > 0 ? ("expense" as const) : ("income" as const),
          category: r.categoryName ?? "Uncategorized",
        }));
      },
    }),

    getAccountBalances: tool({
      description: "Get current balances for all accounts",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = db
          .select({
            name: accounts.name,
            type: accounts.type,
            currentBalance: accounts.currentBalance,
          })
          .from(accounts)
          .where(and(scoped.where(accounts), notDeleted(accounts)))
          .all();

        return rows.map((r) => ({
          name: r.name,
          type: r.type,
          balance: `$${((r.currentBalance ?? 0) / 100).toFixed(2)}`,
        }));
      },
    }),

    getMonthlyTrends: tool({
      description: "Get month-over-month spending totals",
      inputSchema: z.object({
        months: z
          .number()
          .min(1)
          .max(12)
          .default(6)
          .describe("Number of months to show"),
      }),
      execute: async ({ months }) => {
        const now = new Date();
        const results: { month: string; spending: string; income: string }[] =
          [];

        for (let i = 0; i < months; i++) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const start = d.toISOString().split("T")[0];
          const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
            .toISOString()
            .split("T")[0];

          const rows = db
            .select({ amount: transactions.amount })
            .from(transactions)
            .where(
              and(
                scoped.where(transactions),
                gte(transactions.date, start),
                lte(transactions.date, end),
                notDeleted(transactions)
              )
            )
            .all();

          let spending = 0;
          let income = 0;
          for (const r of rows) {
            if (r.amount > 0) spending += r.amount;
            else income += Math.abs(r.amount);
          }

          results.push({
            month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
            spending: `$${(spending / 100).toFixed(2)}`,
            income: `$${(income / 100).toFixed(2)}`,
          });
        }

        return results;
      },
    }),

    getUpcomingBills: tool({
      description: "Get upcoming recurring bills",
      inputSchema: z.object({
        days: z
          .number()
          .min(1)
          .max(30)
          .default(14)
          .describe("Number of days to look ahead"),
      }),
      execute: async ({ days }) => {
        const today = new Date().toISOString().split("T")[0];
        const endDate = new Date(Date.now() + days * 86400000)
          .toISOString()
          .split("T")[0];

        const rows = db
          .select({
            name: recurringTransactions.name,
            amount: recurringTransactions.averageAmount,
            nextDate: recurringTransactions.nextDate,
            frequency: recurringTransactions.frequency,
          })
          .from(recurringTransactions)
          .where(
            and(
              eq(recurringTransactions.householdId, householdId),
              eq(recurringTransactions.isActive, true),
              gte(recurringTransactions.nextDate, today),
              lte(recurringTransactions.nextDate, endDate)
            )
          )
          .all();

        return rows.map((r) => ({
          description: r.name,
          amount: `$${(Math.abs(r.amount ?? 0) / 100).toFixed(2)}`,
          dueDate: r.nextDate,
          frequency: r.frequency,
        }));
      },
    }),

    getBudgetStatus: tool({
      description: "Get budget vs actual spending for current month",
      inputSchema: z.object({
        month: z
          .string()
          .optional()
          .describe("Month (YYYY-MM), defaults to current"),
      }),
      execute: async ({ month }) => {
        const now = new Date();
        const targetMonth =
          month ??
          `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const [year, m] = targetMonth.split("-").map(Number);
        const startDate = `${targetMonth}-01`;
        const endDate = new Date(year, m, 0).toISOString().split("T")[0];

        const budget = db
          .select()
          .from(budgets)
          .where(
            and(
              eq(budgets.householdId, householdId),
              eq(budgets.month, targetMonth)
            )
          )
          .get();

        if (!budget) return { message: "No budget set for this month" };

        const budgetCats = db
          .select()
          .from(budgetCategories)
          .where(eq(budgetCategories.budgetId, budget.id))
          .all();

        const results = [];
        for (const bc of budgetCats) {
          const cat = db
            .select({ name: categories.name })
            .from(categories)
            .where(eq(categories.id, bc.categoryId))
            .get();

          const spent = db
            .select({ amount: transactions.amount })
            .from(transactions)
            .where(
              and(
                scoped.where(transactions),
                eq(transactions.categoryId, bc.categoryId),
                gte(transactions.date, startDate),
                lte(transactions.date, endDate),
                notDeleted(transactions)
              )
            )
            .all()
            .reduce((sum, r) => sum + (r.amount > 0 ? r.amount : 0), 0);

          results.push({
            category: cat?.name ?? "Unknown",
            budgeted: `$${(bc.limitAmount / 100).toFixed(2)}`,
            spent: `$${(spent / 100).toFixed(2)}`,
            remaining: `$${((bc.limitAmount - spent) / 100).toFixed(2)}`,
            percentUsed: Math.round((spent / bc.limitAmount) * 100),
          });
        }

        return results;
      },
    }),
  };
}
