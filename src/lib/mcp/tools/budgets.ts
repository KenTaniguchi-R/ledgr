import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getBudgetForMonth } from "@/queries/budgets";
import { setBudgetCategory } from "@/actions/budgets";
import { getCurrentMonth } from "@/lib/date-utils";
import { centsToDisplay } from "@/lib/money";

const READ_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
} as const;

const WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
} as const;

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
      const budgetMonth = getBudgetForMonth(householdId, month);

      // Enrich with display values
      const result = {
        budget: budgetMonth.budget,
        groups: budgetMonth.groups.map((g) => ({
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
          spentDisplay: centsToDisplay(budgetMonth.unbudgeted.spent),
          ...budgetMonth.unbudgeted,
          categories: budgetMonth.unbudgeted.categories.map((c) => ({
            ...c,
            spentDisplay: centsToDisplay(c.spent),
          })),
        },
        summary: {
          ...budgetMonth.summary,
          totalBudgetedDisplay: centsToDisplay(budgetMonth.summary.totalBudgeted),
          totalSpentDisplay: centsToDisplay(budgetMonth.summary.totalSpent),
          totalRemainingDisplay: centsToDisplay(budgetMonth.summary.totalRemaining),
        },
        lastSyncedAt: budgetMonth.lastSyncedAt,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}

export function registerBudgetWriteTools(server: McpServer, _householdId: string) {
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
      const result = await setBudgetCategory(args.budgetId, args.categoryId, args.limitAmountCents);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
