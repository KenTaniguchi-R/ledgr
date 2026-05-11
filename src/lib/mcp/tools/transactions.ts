import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getTransactions } from "@/queries/transactions";
import { centsToDisplay } from "@/lib/money";

const READ_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
} as const;

export function registerTransactionTools(server: McpServer, householdId: string) {
  server.registerTool(
    "get_transactions",
    {
      title: "Get Transactions",
      description:
        "Fetch a paginated list of transactions. Returns up to 50 rows per page with a cursor for the next page.",
      inputSchema: {
        dateFrom: z.string().optional().describe("Start date in YYYY-MM-DD format"),
        dateTo: z.string().optional().describe("End date in YYYY-MM-DD format"),
        accountId: z.string().optional().describe("Filter by account ID"),
        categoryId: z.string().nullable().optional().describe("Filter by category ID. Pass null to get uncategorized transactions."),
        reviewed: z.boolean().optional().describe("Filter by reviewed status"),
        search: z.string().optional().describe("Search transactions by name"),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
      },
      annotations: READ_ANNOTATIONS,
    },
    async (args) => {
      const { cursor, ...filters } = args;
      const page = getTransactions(householdId, filters, 50, cursor ?? null);

      const rows = page.rows.map((t) => ({
        id: t.id,
        date: t.date,
        name: t.name,
        merchantName: t.merchantName,
        categoryName: t.categoryName,
        categoryGroupName: t.categoryGroupName,
        accountName: t.accountName,
        amountCents: t.normalizedAmount,
        amountDisplay: centsToDisplay(t.normalizedAmount, t.currency),
        isIncome: t.normalizedAmount > 0,
        currency: t.currency,
        pending: t.pending,
        reviewed: t.reviewed,
        notes: t.notes,
        isTransfer: t.isTransfer,
        hasSplits: t.hasSplits,
        categorySource: t.categorySource,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ rows, nextCursor: page.nextCursor }, null, 2),
          },
        ],
      };
    },
  );
}
