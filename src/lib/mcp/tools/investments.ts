import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getPortfolioSummary, getHoldings } from "@/queries/investments";
import { centsToDisplay } from "@/lib/money";
import { READ_ANNOTATIONS } from "../constants";
import { jsonResult } from "../tool-result";

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
      const s = await getPortfolioSummary(householdId);
      return jsonResult({
        totalValueCents: s.totalValue,
        totalValueDisplay: centsToDisplay(s.totalValue),
        dayChangeCents: s.dayChange,
        dayChangeDisplay: s.dayChange !== null ? centsToDisplay(s.dayChange) : null,
        totalGainLossCents: s.totalGainLoss,
        totalGainLossDisplay: centsToDisplay(s.totalGainLoss),
        totalCostBasisCents: s.totalCostBasis,
        totalCostBasisDisplay: centsToDisplay(s.totalCostBasis),
      });
    },
  );

  server.registerTool(
    "get_holdings",
    {
      title: "Get Holdings",
      description:
        "Get investment holdings, optionally consolidated across accounts or broken down by account.",
      inputSchema: {
        view: z.enum(["consolidated", "by-account"]).optional().describe("How to aggregate holdings. Defaults to 'consolidated'."),
        accountId: z.string().optional().describe("Filter to a specific investment account ID"),
      },
      annotations: READ_ANNOTATIONS,
    },
    async (args) => {
      const holdings = await getHoldings(householdId, args.view ?? "consolidated", args.accountId);

      return jsonResult(
        holdings.map((h) => ({
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
        })),
      );
    },
  );
}
