import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDashboardSummary } from "@/queries/dashboard";
import { centsToDisplay } from "@/lib/money";

const READ_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
} as const;

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
      const summary = getDashboardSummary(householdId);
      const result = {
        netWorthCents: summary.netWorth,
        netWorthDisplay: centsToDisplay(summary.netWorth),
        monthlyIncomeCents: summary.monthlyIncome,
        monthlyIncomeDisplay: centsToDisplay(summary.monthlyIncome),
        monthlyExpensesCents: summary.monthlyExpenses,
        monthlyExpensesDisplay: centsToDisplay(summary.monthlyExpenses),
        monthlyNetCents: summary.monthlyNet,
        monthlyNetDisplay: centsToDisplay(summary.monthlyNet),
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
