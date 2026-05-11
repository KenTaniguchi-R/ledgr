import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getCategories } from "@/queries/categories";
import { updateTransactionCategory } from "@/actions/transactions";

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

export function registerCategoryReadTools(server: McpServer, householdId: string) {
  server.registerTool(
    "list_categories",
    {
      title: "List Categories",
      description:
        "List all category groups and their categories for the household.",
      inputSchema: {},
      annotations: READ_ANNOTATIONS,
    },
    async () => {
      const groups = getCategories(householdId);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(groups, null, 2) }],
      };
    },
  );
}

export function registerCategoryWriteTools(server: McpServer, _householdId: string) {
  server.registerTool(
    "update_transaction_category",
    {
      title: "Update Transaction Category",
      description:
        "Set or clear the category for a transaction. Pass null to uncategorize the transaction.",
      inputSchema: {
        transactionId: z.string().min(1).describe("The transaction ID to update"),
        categoryId: z
          .string()
          .nullable()
          .describe("The category ID to assign, or null to uncategorize"),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async (args) => {
      const result = await updateTransactionCategory(args.transactionId, args.categoryId);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
