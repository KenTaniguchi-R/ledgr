import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getBudgetForMonth } from "@/queries/budgets";
import { setBudgetCategoryScoped } from "@/actions/budgets";
import { getCurrentMonth } from "@/lib/date-utils";
import { centsToDisplay } from "@/lib/money";
import { READ_ANNOTATIONS, WRITE_ANNOTATIONS } from "../constants";
import { jsonResult } from "../tool-result";

export function registerBudgetReadTools(server: McpServer, householdId: string) {
  server.registerTool(
    "get_budget",
    {
      title: "Get Budget",
      description:
        "Get the budget for a given month, including category groups, spending, and summary totals.",
      inputSchema: {
        month: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .optional()
          .describe("Month in YYYY-MM format. Defaults to the current month."),
      },
      annotations: READ_ANNOTATIONS,
    },
    async (args) => {
      const month = args.month ?? getCurrentMonth();
      const b = await getBudgetForMonth(householdId, month);

      return jsonResult({
        budget: b.budget,
        groups: b.groups.map((g) => ({
          ...g,
          totalBudgetedDisplay: centsToDisplay(g.totalBudgeted),
          totalSpentDisplay: centsToDisplay(g.totalSpent),
          categories: g.categories.map((c) => ({
            ...c,
            limitAmountDisplay: centsToDisplay(c.limitAmount),
            spentDisplay: centsToDisplay(c.spent),
            remainingDisplay: centsToDisplay(c.remaining),
          })),
        })),
        unbudgeted: {
          ...b.unbudgeted,
          spentDisplay: centsToDisplay(b.unbudgeted.spent),
          categories: b.unbudgeted.categories.map((c) => ({
            ...c,
            spentDisplay: centsToDisplay(c.spent),
          })),
        },
        summary: {
          ...b.summary,
          totalBudgetedDisplay: centsToDisplay(b.summary.totalBudgeted),
          totalSpentDisplay: centsToDisplay(b.summary.totalSpent),
          totalRemainingDisplay: centsToDisplay(b.summary.totalRemaining),
        },
        lastSyncedAt: b.lastSyncedAt,
      });
    },
  );
}

export function registerBudgetWriteTools(server: McpServer, householdId: string) {
  server.registerTool(
    "set_budget_category",
    {
      title: "Set Budget Category",
      description:
        "Set or update the spending limit for a category within a budget. Creates the budget category row if it does not exist.",
      inputSchema: {
        budgetId: z.string().min(1).describe("The budget ID"),
        categoryId: z.string().min(1).describe("The category ID to set the limit for"),
        limitAmountCents: z
          .number()
          .int()
          .min(0)
          .describe("The spending limit in cents (e.g. 5000 = $50.00)"),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async (args) => {
      const result = await setBudgetCategoryScoped(householdId, args.budgetId, args.categoryId, args.limitAmountCents);
      return jsonResult(result);
    },
  );
}
