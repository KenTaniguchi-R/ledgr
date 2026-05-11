import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getUpcomingBills } from "@/queries/recurring";
import { centsToDisplay } from "@/lib/money";
import { READ_ANNOTATIONS } from "../constants";
import { jsonResult } from "../tool-result";

export function registerRecurringTools(server: McpServer, householdId: string) {
  server.registerTool(
    "get_upcoming_bills",
    {
      title: "Get Upcoming Bills",
      description: "Get upcoming recurring bills sorted by next due date.",
      inputSchema: {
        search: z.string().optional().describe("Search bills by name"),
        limit: z.number().int().min(1).max(100).optional().describe("Maximum number of bills to return"),
      },
      annotations: READ_ANNOTATIONS,
    },
    async (args) => {
      const bills = await getUpcomingBills(householdId, { search: args.search, limit: args.limit });

      return jsonResult(
        bills.map((b) => ({
          id: b.id,
          name: b.name,
          merchantName: b.merchantName,
          categoryName: b.categoryName,
          categoryIcon: b.categoryIcon,
          averageAmountCents: b.averageAmount,
          averageAmountDisplay: b.averageAmount !== null ? centsToDisplay(b.averageAmount) : null,
          lastAmountCents: b.lastAmount,
          lastAmountDisplay: b.lastAmount !== null ? centsToDisplay(b.lastAmount) : null,
          frequency: b.frequency,
          nextDate: b.nextDate,
          lastDate: b.lastDate,
          isIncome: b.isIncome,
          status: b.status,
          relativeDateLabel: b.relativeDateLabel,
        })),
      );
    },
  );
}
