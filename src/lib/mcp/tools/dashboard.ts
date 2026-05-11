import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDashboardSummary } from "@/queries/dashboard";
import { centsToDisplay } from "@/lib/money";
import { READ_ANNOTATIONS } from "../constants";
import { jsonResult } from "../tool-result";

export function registerDashboardTools(server: McpServer, householdId: string) {
  server.registerTool(
    "get_dashboard_summary",
    {
      title: "Get Dashboard Summary",
      description:
        "Get the household dashboard summary: net worth, monthly income, monthly expenses, and monthly net.",
      inputSchema: {},
      annotations: READ_ANNOTATIONS,
    },
    async () => {
      const s = getDashboardSummary(householdId);
      return jsonResult({
        netWorthCents: s.netWorth,
        netWorthDisplay: centsToDisplay(s.netWorth),
        monthlyIncomeCents: s.monthlyIncome,
        monthlyIncomeDisplay: centsToDisplay(s.monthlyIncome),
        monthlyExpensesCents: s.monthlyExpenses,
        monthlyExpensesDisplay: centsToDisplay(s.monthlyExpenses),
        monthlyNetCents: s.monthlyNet,
        monthlyNetDisplay: centsToDisplay(s.monthlyNet),
      });
    },
  );
}
