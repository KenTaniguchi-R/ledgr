import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getPortfolioSummary, getHoldings } from "@/queries/investments";
import { centsToDisplay } from "@/lib/money";

const READ_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
} as const;

export function registerInvestmentTools(server: McpServer, householdId: string) {
  server.registerTool(
    "get_portfolio_summary",
    {
      title: "Get Portfolio Summary",
      description:
        "Get investment portfolio summary: total value, day change, total gain/loss, and cost basis.",
      inputSchema: {},
      annotations: READ_ANNOTATIONS,
    },
    async () => {
      const summary = getPortfolioSummary(householdId);
      const result = {
        totalValueCents: summary.totalValue,
        totalValueDisplay: centsToDisplay(summary.totalValue),
        dayChangeCents: summary.dayChange,
        dayChangeDisplay: summary.dayChange !== null
          ? centsToDisplay(summary.dayChange)
          : null,
        totalGainLossCents: summary.totalGainLoss,
        totalGainLossDisplay: centsToDisplay(summary.totalGainLoss),
        totalCostBasisCents: summary.totalCostBasis,
        totalCostBasisDisplay: centsToDisplay(summary.totalCostBasis),
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    "get_holdings",
    {
      title: "Get Holdings",
      description:
        "Get investment holdings, optionally consolidated across accounts or broken down by account.",
      inputSchema: {
        view: z
          .enum(["consolidated", "by-account"])
          .optional()
          .describe("How to aggregate holdings. Defaults to 'consolidated'."),
        accountId: z
          .string()
          .optional()
          .describe("Filter to a specific investment account ID"),
      },
      annotations: READ_ANNOTATIONS,
    },
    async (args) => {
      const view = args.view ?? "consolidated";
      const holdings = getHoldings(householdId, view, args.accountId);

      const result = holdings.map((h) => ({
        ticker: h.ticker,
        securityName: h.securityName,
        type: h.type,
        sector: h.sector,
        quantity: h.quantity,
        currentValueCents: h.currentValue,
        currentValueDisplay: centsToDisplay(h.currentValue),
        costBasisCents: h.costBasis,
        costBasisDisplay: h.costBasis !== null ? centsToDisplay(h.costBasis) : null,
        gainLossCents: h.gainLoss,
        gainLossDisplay: h.gainLoss !== null ? centsToDisplay(h.gainLoss) : null,
        gainLossPercent: h.gainLossPercent,
        accountName: h.accountName,
        accountId: h.accountId,
      }));

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
