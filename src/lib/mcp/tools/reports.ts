import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSpendingByCategory, getIncomeVsExpense } from "@/queries/reports";
import { centsToDisplay } from "@/lib/money";
import { READ_ANNOTATIONS } from "../constants";
import { jsonResult } from "../tool-result";

export function registerReportTools(server: McpServer, householdId: string) {
  server.registerTool(
    "get_spending_report",
    {
      title: "Get Spending Report",
      description:
        "Get spending broken down by category for a date range, with optional account and category filters.",
      inputSchema: {
        dateFrom: z.string().describe("Start date in YYYY-MM-DD format"),
        dateTo: z.string().describe("End date in YYYY-MM-DD format"),
        accountIds: z.array(z.string()).optional().describe("Filter by account IDs"),
        categoryIds: z.array(z.string()).optional().describe("Filter by category IDs"),
      },
      annotations: READ_ANNOTATIONS,
    },
    async (args) => {
      const rows = getSpendingByCategory(householdId, {
        dateFrom: args.dateFrom,
        dateTo: args.dateTo,
        accountIds: args.accountIds,
        categoryIds: args.categoryIds,
      });

      return jsonResult(
        rows.map((r) => ({
          categoryId: r.categoryId,
          categoryName: r.categoryName,
          groupName: r.groupName,
          groupId: r.groupId,
          totalCents: r.total,
          totalDisplay: centsToDisplay(r.total),
          prevTotalCents: r.prevTotal,
          prevTotalDisplay: centsToDisplay(r.prevTotal),
        })),
      );
    },
  );

  server.registerTool(
    "get_income_vs_expense",
    {
      title: "Get Income vs Expense",
      description:
        "Get monthly income and expense totals over a date range, with optional account filter.",
      inputSchema: {
        dateFrom: z.string().describe("Start date in YYYY-MM-DD format"),
        dateTo: z.string().describe("End date in YYYY-MM-DD format"),
        accountIds: z.array(z.string()).optional().describe("Filter by account IDs"),
      },
      annotations: READ_ANNOTATIONS,
    },
    async (args) => {
      const rows = getIncomeVsExpense(householdId, {
        dateFrom: args.dateFrom,
        dateTo: args.dateTo,
        accountIds: args.accountIds,
      });

      return jsonResult(
        rows.map((r) => ({
          period: r.period,
          incomeCents: r.income,
          incomeDisplay: centsToDisplay(r.income),
          expensesCents: r.expenses,
          expensesDisplay: centsToDisplay(r.expenses),
          netCents: r.net,
          netDisplay: centsToDisplay(r.net),
        })),
      );
    },
  );
}
