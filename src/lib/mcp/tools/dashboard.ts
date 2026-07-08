import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { NetWorthPoint } from "@/queries/dashboard";
import { getDashboardSummary, getNetWorthHistory } from "@/queries/dashboard";
import { centsToDisplay } from "@/lib/money";
import { READ_ANNOTATIONS } from "../constants";
import { jsonResult } from "../tool-result";

export interface NetWorthHistoryEntry {
  date: string;
  assetsCents: number;
  assetsDisplay: string;
  liabilitiesCents: number;
  liabilitiesDisplay: string;
  netWorthCents: number;
  netWorthDisplay: string;
}

/**
 * Map a net-worth series onto the MCP wire shape: every figure carries both the
 * raw cents (for agents doing math) and a formatted display string.
 */
export function formatNetWorthHistory(points: NetWorthPoint[]): NetWorthHistoryEntry[] {
  return points.map((p) => ({
    date: p.date,
    assetsCents: p.assets,
    assetsDisplay: centsToDisplay(p.assets),
    liabilitiesCents: p.liabilities,
    liabilitiesDisplay: centsToDisplay(p.liabilities),
    netWorthCents: p.netWorth,
    netWorthDisplay: centsToDisplay(p.netWorth),
  }));
}

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
      const s = await getDashboardSummary(householdId);
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

  server.registerTool(
    "get_net_worth_history",
    {
      title: "Get Net Worth History",
      description:
        "Get the household net-worth trend over time as a dated series of assets, liabilities, and net worth. The final point reflects today's live balances.",
      inputSchema: {
        range: z
          .enum(["1M", "3M", "6M", "1Y", "all"])
          .optional()
          .describe("Time window for the series. Defaults to '6M'."),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ range }) => {
      const points = await getNetWorthHistory(householdId, range ?? "6M");
      return jsonResult(formatNetWorthHistory(points));
    },
  );
}
