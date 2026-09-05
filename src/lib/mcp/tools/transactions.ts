import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { getTransactions } from "@/queries/transactions";
import { confirmTransferSuggestionScoped, rejectTransferSuggestionScoped } from "@/actions/transaction-detail";
import { centsToDisplay } from "@/lib/money";
import { withHousehold } from "@/lib/household-context";
import { READ_ANNOTATIONS, WRITE_ANNOTATIONS } from "../constants";
import { JSON_RESULT_SCHEMA, jsonResult } from "../tool-result";

export function registerTransactionTools(server: McpServer, householdId: string) {
  server.registerTool(
    "get_transactions",
    {
      title: "Get Transactions",
      description:
        "Fetch a paginated list of transactions. Returns up to 50 rows per page with a cursor for the next page.",
      inputSchema: z.object({
        dateFrom: z.string().optional().describe("Start date in YYYY-MM-DD format"),
        dateTo: z.string().optional().describe("End date in YYYY-MM-DD format"),
        accountId: z.string().optional().describe("Filter by account ID"),
        categoryId: z.string().nullable().optional().describe("Filter by category ID. Pass null to get uncategorized transactions."),
        reviewed: z.boolean().optional().describe("Filter by reviewed status"),
        search: z.string().optional().describe("Search transactions by name"),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
      }),
      outputSchema: JSON_RESULT_SCHEMA,
      annotations: READ_ANNOTATIONS,
    },
    async (args) => {
      const { cursor, ...filters } = args;
      const page = await withHousehold(householdId, (tx) => getTransactions(householdId, filters, 50, cursor ?? null, tx));

      return jsonResult({
        rows: page.rows.map((t) => ({
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
        })),
        nextCursor: page.nextCursor,
      });
    },
  );
}

export function registerTransactionWriteTools(server: McpServer, householdId: string) {
  server.registerTool(
    "mark_transaction_transfer",
    {
      title: "Mark Transaction As Transfer",
      description:
        "Mark a transaction as a transfer (money moving between accounts, e.g. a credit card payoff or a savings transfer) so it's excluded from spending/income totals, or clear that flag to keep it as real spending/income. This is the fix for a transaction Ledgr didn't auto-detect as a transfer — for example a payment to a credit card or bank account that isn't itself connected to Ledgr.",
      inputSchema: z.object({
        transactionId: z.string().min(1).describe("The transaction ID to update"),
        isTransfer: z
          .boolean()
          .describe("true to mark as a transfer (excluded from totals), false to keep it as real spending/income"),
      }),
      outputSchema: JSON_RESULT_SCHEMA,
      annotations: WRITE_ANNOTATIONS,
    },
    async (args) => {
      const result = args.isTransfer
        ? await confirmTransferSuggestionScoped(householdId, args.transactionId)
        : await rejectTransferSuggestionScoped(householdId, args.transactionId);
      return jsonResult(result);
    },
  );
}
